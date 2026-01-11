import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv } from "@/lib/projects";

function injectUpdateFrontmatter(content: string, login: string) {
  const now = new Date().toISOString();
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---\n", 4);
    if (end !== -1) {
      const header = content.slice(4, end);
      const body = content.slice(end + 5);
      const lines = header.split(/\r?\n/);
      const map: Record<string, string> = {};
      for (const line of lines) {
        const idx = line.indexOf(":");
        if (idx > -1) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          map[k] = v;
        }
      }
      map["updated_by"] = login;
      map["updated"] = now;
      const newHeader = Object.entries(map)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      return `---\n${newHeader}\n---\n${body}`;
    }
  }
  // no header found, add a small header
  return `---\nupdated_by: ${login}\nupdated: ${now}\n---\n\n${content}`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = getRepoEnv(req, "testcases");
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  let owner: string | undefined;
  let name: string | undefined;
  if (repoEnv.includes("github.com")) {
    const u = new URL(repoEnv);
    const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
    owner = parts[parts.length - 2];
    name = parts[parts.length - 1];
  } else {
    const parts = repoEnv.split("/");
    owner = parts[0];
    name = parts[1];
  }
  if (!owner || !name) {
    return new Response(JSON.stringify({ error: "Invalid TESTCASES_REPO" }), { status: 500 });
  }

  try {
    const { path, content, ref } = await req.json();
    if (!path || !content) {
      return new Response(JSON.stringify({ error: "path and content are required" }), { status: 400 });
    }

    // Get user login
    const me = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const meData = await me.json();
    const login = meData.login || "unknown";

    // Get current file to obtain sha
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      }
    );
    if (!getRes.ok) {
      const text = await getRes.text();
      return new Response(text, { status: getRes.status });
    }
    const fileData = await getRes.json();

    const newContent = injectUpdateFrontmatter(content, login);

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Update test case by ${login}`,
          content: Buffer.from(newContent).toString("base64"),
          sha: fileData.sha,
          ...(ref ? { branch: ref } : {}),
        }),
      }
    );

    if (!putRes.ok) {
      const text = await putRes.text();
      return new Response(text, { status: putRes.status });
    }

    const data = await putRes.json();
    return new Response(JSON.stringify({ success: true, content: data.content }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Failed to update test case" }), { status: 500 });
  }
}
