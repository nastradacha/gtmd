import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = process.env.TESTCASES_REPO;
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  // Support both "owner/name" and a full GitHub URL
  let owner: string | undefined;
  let name: string | undefined;

  if (repoEnv.includes("github.com")) {
    try {
      const u = new URL(repoEnv);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      owner = parts[parts.length - 2];
      name = parts[parts.length - 1];
    } catch {
      // fallthrough to validation below
    }
  } else {
    const parts = repoEnv.split("/");
    owner = parts[0];
    name = parts[1];
  }

  if (!owner || !name) {
    return new Response(
      JSON.stringify({ error: 'Invalid TESTCASES_REPO format. Use "owner/name" or a full GitHub URL.' }),
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  const ref = searchParams.get("ref");

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${session.accessToken}`,
  };

  if (path) {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}${refQuery}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  }

  // Default: list all Markdown files under qa-testcases/ (manual and Regression) using Git Trees API
  // 1) get main ref sha
  const mainRefRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`, {
    headers,
    cache: "no-store",
  });
  if (!mainRefRes.ok) {
    const text = await mainRefRes.text();
    return new Response(text, { status: mainRefRes.status });
  }
  const mainRef = await mainRefRes.json();
  const mainSha = mainRef.object.sha;

  // 2) fetch tree recursively
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${mainSha}?recursive=1`, {
    headers,
    cache: "no-store",
  });
  if (!treeRes.ok) {
    const text = await treeRes.text();
    return new Response(text, { status: treeRes.status });
  }
  const treeData = await treeRes.json();

  const map = new Map<string, any>();
  for (const entry of treeData.tree || []) {
    if (entry.type === "blob" && typeof entry.path === "string" && entry.path.startsWith("qa-testcases/") && entry.path.endsWith(".md")) {
      const pathOnly = entry.path as string;
      const nameOnly = pathOnly.split("/").pop();
      map.set(pathOnly, {
        path: pathOnly,
        name: nameOnly,
        url: `https://github.com/${owner}/${name}/blob/main/${pathOnly}`,
      });
    }
  }

  // Also include pending files from open PRs (added/modified under qa-testcases/manual)
  const prsRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls?state=open&per_page=50`, {
    headers,
    cache: "no-store",
  });
  if (prsRes.ok) {
    const prs = await prsRes.json();
    for (const pr of prs) {
      const filesRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls/${pr.number}/files`, {
        headers,
        cache: "no-store",
      });
      if (!filesRes.ok) continue;
      const prFiles = await filesRes.json();
      for (const f of prFiles) {
        const filename = f.filename as string;
        if (filename.startsWith("qa-testcases/") && filename.endsWith(".md")) {
          const entry = map.get(filename) || { path: filename, name: filename.split("/").pop(), url: pr.html_url };
          entry.pending = true;
          entry.ref = pr.head?.ref;
          entry.prNumber = pr.number;
          entry.prUrl = pr.html_url;
          map.set(filename, entry);
        }
      }
    }
  }

  const files = Array.from(map.values());
  return new Response(JSON.stringify(files), { status: 200 });
}
