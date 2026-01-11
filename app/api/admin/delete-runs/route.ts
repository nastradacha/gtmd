import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRepoEnv } from "@/lib/projects";

function parseRepoEnv(repoEnv: string) {
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
  if (!owner || !name) throw new Error("Invalid repo format");
  return { owner, name };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const TESTCASES_REPO = getRepoEnv(req, "testcases");
  if (!TESTCASES_REPO) {
    return new Response(JSON.stringify({ error: "Missing TESTCASES_REPO" }), { status: 500 });
  }

  let owner: string, name: string;
  try {
    ({ owner, name } = parseRepoEnv(TESTCASES_REPO));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const testPath = searchParams.get("testPath");

  try {
    const ghHeaders = {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/vnd.github+json",
    };

    // If testPath provided, list runs for that specific test
    if (testPath) {
      const runDir = `qa-runs/${testPath}`;
      
      const contentsRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runDir)}`,
        { headers: ghHeaders }
      );

      if (!contentsRes.ok) {
        if (contentsRes.status === 404) {
          return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        }
        return new Response(await contentsRes.text(), { status: contentsRes.status });
      }

      const files = await contentsRes.json();
      const runs = files
        .filter((f: any) => f.type === "file" && /run-\d+(-[a-z0-9]+)?\.json$/.test(f.name))
        .map((f: any) => ({
          path: f.path,
          name: f.name,
          sha: f.sha,
          timestamp: f.name.match(/run-(\d+)(?:-[a-z0-9]+)?\.json$/)?.[1],
        }))
        .sort((a: any, b: any) => parseInt(b.timestamp) - parseInt(a.timestamp));

      return new Response(JSON.stringify({ runs }), { status: 200 });
    }

    // Otherwise, list all runs across all tests
    const mainRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`,
      { headers: ghHeaders }
    );
    if (!mainRefRes.ok) {
      return new Response(await mainRefRes.text(), { status: mainRefRes.status });
    }
    const mainRef = await mainRefRes.json();
    const mainSha = mainRef.object.sha;

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${mainSha}?recursive=1`,
      { headers: ghHeaders }
    );
    if (!treeRes.ok) {
      return new Response(await treeRes.text(), { status: treeRes.status });
    }
    const treeData = await treeRes.json();

    const runFiles: any[] = [];
    for (const entry of treeData.tree || []) {
      if (entry.type === "blob" && typeof entry.path === "string") {
        const p = entry.path as string;
        if (p.startsWith("qa-runs/") && /run-\d+(-[a-z0-9]+)?\.json$/.test(p)) {
          const msMatch = p.match(/run-(\d+)(?:-[a-z0-9]+)?\.json$/);
          const timestamp = msMatch ? msMatch[1] : "0";
          runFiles.push({
            path: p,
            name: p.split("/").pop(),
            timestamp,
            date: new Date(parseInt(timestamp)).toISOString(),
          });
        }
      }
    }

    runFiles.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

    return new Response(JSON.stringify({ runs: runFiles }), { status: 200 });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to list runs" }),
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const TESTCASES_REPO = getRepoEnv(req, "testcases");
  if (!TESTCASES_REPO) {
    return new Response(JSON.stringify({ error: "Missing TESTCASES_REPO" }), { status: 500 });
  }

  let owner: string, name: string;
  try {
    ({ owner, name } = parseRepoEnv(TESTCASES_REPO));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }

  try {
    const body = await req.json();
    const { runPath, updateLatest } = body;

    if (!runPath) {
      return new Response(JSON.stringify({ error: "runPath is required" }), { status: 400 });
    }

    const ghHeaders = {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/vnd.github+json",
    };

    // Get file SHA
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
      { headers: ghHeaders }
    );

    if (!fileRes.ok) {
      return new Response(
        JSON.stringify({ error: `File not found: ${runPath}` }),
        { status: 404 }
      );
    }

    const fileData = await fileRes.json();
    const fileSha = fileData.sha;

    // Delete the file
    const deleteRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Delete test run: ${runPath}`,
          sha: fileSha,
          branch: "main",
        }),
      }
    );

    if (!deleteRes.ok) {
      const errorText = await deleteRes.text();
      return new Response(
        JSON.stringify({ error: `Failed to delete file: ${errorText}` }),
        { status: deleteRes.status }
      );
    }

    // If updateLatest is true, recalculate latest.json
    if (updateLatest) {
      const runDir = runPath.substring(0, runPath.lastIndexOf("/"));
      const latestPath = `${runDir}/latest.json`;

      // Get all remaining runs
      const contentsRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runDir)}`,
        { headers: ghHeaders }
      );

      if (contentsRes.ok) {
        const files = await contentsRes.json();
        const remainingRuns = files
          .filter((f: any) => f.type === "file" && /run-\d+(-[a-z0-9]+)?\.json$/.test(f.name))
          .map((f: any) => ({
            name: f.name,
            timestamp: parseInt(f.name.match(/run-(\d+)(?:-[a-z0-9]+)?\.json$/)?.[1] || "0"),
          }))
          .sort((a: any, b: any) => b.timestamp - a.timestamp);

        if (remainingRuns.length > 0) {
          // Fetch the latest run to get its details
          const latestRunPath = `${runDir}/${remainingRuns[0].name}`;
          const latestRunRes = await fetch(
            `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestRunPath)}`,
            { headers: ghHeaders }
          );

          if (latestRunRes.ok) {
            const latestRunData = await latestRunRes.json();
            const latestRunContent = JSON.parse(
              Buffer.from(latestRunData.content, "base64").toString("utf-8")
            );

            const newLatest = {
              result: latestRunContent.result,
              executed_at: latestRunContent.executed_at,
              executed_by: latestRunContent.executed_by,
              run_file: remainingRuns[0].name,
              updated_at: new Date().toISOString(),
            };

            // Check if latest.json exists
            const latestCheckRes = await fetch(
              `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestPath)}`,
              { headers: ghHeaders }
            );

            const latestPutBody: any = {
              message: `Update latest run index after deletion`,
              content: Buffer.from(JSON.stringify(newLatest, null, 2)).toString("base64"),
              branch: "main",
            };

            if (latestCheckRes.ok) {
              const latestData = await latestCheckRes.json();
              latestPutBody.sha = latestData.sha;
            }

            await fetch(
              `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestPath)}`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${session.accessToken}`,
                  Accept: "application/vnd.github+json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(latestPutBody),
              }
            );
          }
        } else {
          // No runs left, delete latest.json if it exists
          const latestCheckRes = await fetch(
            `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestPath)}`,
            { headers: ghHeaders }
          );

          if (latestCheckRes.ok) {
            const latestData = await latestCheckRes.json();
            await fetch(
              `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestPath)}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${session.accessToken}`,
                  Accept: "application/vnd.github+json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: `Delete latest.json (no runs remaining)`,
                  sha: latestData.sha,
                  branch: "main",
                }),
              }
            );
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Run deleted successfully" }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to delete run" }),
      { status: 500 }
    );
  }
}
