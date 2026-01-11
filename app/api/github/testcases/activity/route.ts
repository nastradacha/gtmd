import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRepoEnv } from "@/lib/projects";

/**
 * GET /api/github/testcases/activity
 * Returns recent test execution activity across all test cases
 * Query params:
 *  - limit: max number of runs to return (default 50, max 200)
 *  - since: ISO date string to filter runs after this date
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = getRepoEnv(req, "testcases");
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  let owner: string, name: string;
  try {
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
    if (!owner || !name) throw new Error("Invalid repo format");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));
    const since = searchParams.get("since");
    const sinceDate = since ? new Date(since) : null;

    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/vnd.github+json",
    };

    // Get the main branch tree to find all qa-runs directories
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`, {
      headers,
      cache: "no-store",
    });
    if (!refRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch main branch" }), { status: refRes.status });
    }
    const refData = await refRes.json();
    const mainSha = refData.object.sha;

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${mainSha}?recursive=1`,
      { headers, cache: "no-store" }
    );
    if (!treeRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch tree" }), { status: treeRes.status });
    }
    const treeData = await treeRes.json();

    // Find all run JSON files
    const runFiles = (treeData.tree || [])
      .filter((entry: any) => 
        entry.type === "blob" && 
        entry.path.startsWith("qa-runs/") && 
        /run-\d+(-[a-z0-9]+)?\.json$/.test(entry.path)
      )
      .map((entry: any) => ({
        path: entry.path,
        sha: entry.sha,
        timestamp: parseInt(entry.path.match(/run-(\d+)(?:-[a-z0-9]+)?\.json$/)?.[1] || "0", 10),
      }))
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, limit * 2); // Fetch more than needed in case some are filtered

    // Fetch run details
    const runs = [];
    for (const file of runFiles) {
      try {
        const fileRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(file.path)}`,
          { headers, cache: "no-store" }
        );
        if (!fileRes.ok) continue;

        const fileData = await fileRes.json();
        const content = Buffer.from(fileData.content || "", "base64").toString("utf-8");
        const runData = JSON.parse(content);

        // Filter by date if provided
        if (sinceDate && new Date(runData.executed_at) < sinceDate) continue;

        // Decode test case path from directory name
        const match = file.path.match(/qa-runs\/([^\/]+)\//);
        const encodedPath = match ? match[1] : "";
        const testCasePath = encodedPath.replace(/__/g, "/");

        runs.push({
          ...runData,
          run_file: file.path.split("/").pop(),
          test_case_path: testCasePath,
          timestamp: file.timestamp,
        });

        if (runs.length >= limit) break;
      } catch (e) {
        // Skip invalid run files
        continue;
      }
    }

    // Sort by executed_at descending
    runs.sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());

    return new Response(
      JSON.stringify({ runs, total: runs.length }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch activity" }),
      { status: 500 }
    );
  }
}
