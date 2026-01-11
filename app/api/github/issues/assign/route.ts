import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv } from "@/lib/projects";

function parseRepo(repoEnv?: string): { owner: string; name: string } | null {
  if (!repoEnv) return null;
  if (repoEnv.includes("github.com")) {
    try {
      const u = new URL(repoEnv);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      return { owner: parts[parts.length - 2], name: parts[parts.length - 1] };
    } catch {
      return null;
    }
  }
  const parts = repoEnv.split("/");
  return parts.length >= 2 ? { owner: parts[0], name: parts[1] } : null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoParsed = parseRepo(getRepoEnv(req, "stories"));
  if (!repoParsed) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
  }

  try {
    const { issue_number, me, assignees, clear } = await req.json();
    if (!issue_number) {
      return new Response(JSON.stringify({ error: "issue_number is required" }), { status: 400 });
    }

    let desired: string[] = Array.isArray(assignees) ? assignees : [];

    if (me) {
      // Fetch current user login
      const meRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
      });
      const meData = await meRes.json();
      if (meData?.login) desired = [meData.login];
    }

    if (clear) desired = [];

    const patchRes = await fetch(
      `https://api.github.com/repos/${repoParsed.owner}/${repoParsed.name}/issues/${issue_number}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignees: desired }),
      }
    );

    if (!patchRes.ok) {
      const text = await patchRes.text();
      return new Response(text, { status: patchRes.status });
    }

    const data = await patchRes.json();
    return new Response(JSON.stringify({ success: true, issue: data }), { status: 200 });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to assign issue" }),
      { status: 500 }
    );
  }
}
