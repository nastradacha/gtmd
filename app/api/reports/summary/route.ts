import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
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

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${session.accessToken}`,
  };

  try {
    // 1) Get main SHA
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

    // 2) Get tree recursively
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${mainSha}?recursive=1`, {
      headers,
      cache: "no-store",
    });
    if (!treeRes.ok) {
      const text = await treeRes.text();
      return new Response(text, { status: treeRes.status });
    }
    const tree = await treeRes.json();

    // Collect all test cases
    const testFiles: string[] = [];
    for (const entry of tree.tree || []) {
      if (
        entry.type === "blob" &&
        typeof entry.path === "string" &&
        entry.path.startsWith("qa-testcases/") &&
        entry.path.endsWith(".md")
      ) {
        testFiles.push(entry.path);
      }
    }

    // Collect latest run file per test
    type RunMeta = { result: string; executed_at: string };
    const latestByTest: Record<string, RunMeta | null> = {};

    // Build a map of run files by run directory using tree only
    const runsByDir: Record<string, string[]> = {};
    for (const entry of tree.tree || []) {
      if (
        entry.type === "blob" &&
        typeof entry.path === "string" &&
        entry.path.startsWith("qa-runs/") &&
        /run-\d+\.json$/.test(entry.path)
      ) {
        const p = entry.path as string;
        const dir = p.substring(0, p.lastIndexOf("/"));
        if (!runsByDir[dir]) runsByDir[dir] = [];
        runsByDir[dir].push(p);
      }
    }

    // Helper to encode test path like the result endpoint does
    function encodeTestPath(path: string) {
      const safe = path.replace(/[^a-zA-Z0-9/_-]/g, "-");
      return safe.replace(/\//g, "__");
    }

    // For each test, find its run dir and fetch the latest one json
    for (const test of testFiles) {
      const runDir = `qa-runs/${encodeTestPath(test)}`;
      const files = runsByDir[runDir] || [];
      if (files.length === 0) {
        latestByTest[test] = null;
        continue;
      }
      const latest = files
        .map((fp) => ({ fp, ts: parseInt(fp.replace(/.*run-(\d+)\.json$/, "$1"), 10) }))
        .sort((a, b) => b.ts - a.ts)[0];
      try {
        const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${latest.fp}`, {
          headers,
          cache: "no-store",
        });
        if (!contentsRes.ok) {
          latestByTest[test] = null;
          continue;
        }
        const contents = await contentsRes.json();
        const jsonText = Buffer.from(contents.content || "", "base64").toString("utf-8");
        const json = JSON.parse(jsonText);
        latestByTest[test] = { result: json.result, executed_at: json.executed_at };
      } catch {
        latestByTest[test] = null;
      }
    }

    // Aggregate
    const totals = {
      testcases: testFiles.length,
      latest_pass: 0,
      latest_fail: 0,
      no_runs: 0,
    };
    const byFolder: Record<string, { count: number; pass: number; fail: number; no_runs: number }> = {};
    const failures: Array<{ path: string; folder: string; result: string; executed_at: string }> = [];

    function folderOf(path: string): string {
      const parts = path.split("/");
      // qa-testcases/<top>/<...>
      return parts.slice(0, 3).join("/"); // e.g., qa-testcases/manual/home-page
    }

    for (const t of testFiles) {
      const f = folderOf(t);
      if (!byFolder[f]) byFolder[f] = { count: 0, pass: 0, fail: 0, no_runs: 0 };
      byFolder[f].count += 1;
      const latest = latestByTest[t];
      if (!latest) {
        totals.no_runs += 1;
        byFolder[f].no_runs += 1;
      } else if ((latest.result || "").toLowerCase() === "pass") {
        totals.latest_pass += 1;
        byFolder[f].pass += 1;
      } else {
        totals.latest_fail += 1;
        byFolder[f].fail += 1;
        failures.push({ path: t, folder: f, result: latest.result, executed_at: latest.executed_at });
      }
    }

    return new Response(
      JSON.stringify({ totals, byFolder, failures }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Failed to build summary" }), { status: 500 });
  }
}
