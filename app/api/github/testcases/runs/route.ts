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
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 20)));
    if (!path) {
      return new Response(JSON.stringify({ error: "path is required" }), { status: 400 });
    }

    const safePath = path.replace(/[^a-zA-Z0-9/_-]/g, "-");
    const runDir = `qa-runs/${safePath.replace(/\//g, "__")}`;

    const listRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runDir)}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      }
    );

    if (listRes.status === 404) {
      return new Response(
        JSON.stringify({ latest: null, runs: [] }),
        { status: 200 }
      );
    }

    if (!listRes.ok) {
      const text = await listRes.text();
      return new Response(text, { status: listRes.status });
    }

    const list = await listRes.json();
    const files = (Array.isArray(list) ? list : [])
      .filter((x: any) => x.type === "file" && /run-\d+\.json$/.test(x.name))
      .sort((a: any, b: any) => {
        const na = parseInt(a.name.replace(/\D/g, ""), 10);
        const nb = parseInt(b.name.replace(/\D/g, ""), 10);
        return nb - na;
      })
      .slice(0, limit);

    const runs = [] as any[];
    for (const f of files) {
      const r = await fetch(f.download_url, { cache: "no-store" });
      if (r.ok) {
        const json = await r.json();
        runs.push({ name: f.name, path: f.path, ...json });
      }
    }

    const latest = runs[0] || null;
    return new Response(
      JSON.stringify({ latest, runs }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to list test runs" }),
      { status: 500 }
    );
  }
}
