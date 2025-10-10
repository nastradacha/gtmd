import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Backfill latest.json indices for existing test runs
 * GET /api/admin/backfill-run-indices?dryRun=true
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "true";

  const repoEnv = process.env.TESTCASES_REPO;
  if (!repoEnv) {
    return NextResponse.json({ error: "TESTCASES_REPO not configured" }, { status: 500 });
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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: "application/vnd.github+json",
  };

  try {
    // Get the main branch SHA
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`, {
      headers,
      cache: "no-store",
    });
    if (!refRes.ok) {
      return NextResponse.json({ error: "Failed to fetch main branch" }, { status: refRes.status });
    }
    const refData = await refRes.json();
    const mainSha = refData.object.sha;

    // Get the tree recursively to find all qa-runs directories
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${mainSha}?recursive=1`,
      { headers, cache: "no-store" }
    );
    if (!treeRes.ok) {
      return NextResponse.json({ error: "Failed to fetch tree" }, { status: treeRes.status });
    }
    const treeData = await treeRes.json();

    // Find all run directories (qa-runs/<encoded-path>/)
    const runDirs = new Set<string>();
    for (const entry of treeData.tree || []) {
      if (entry.type === "blob" && entry.path.startsWith("qa-runs/") && entry.path.endsWith(".json")) {
        const match = entry.path.match(/^qa-runs\/([^\/]+)\//);
        if (match) {
          runDirs.add(`qa-runs/${match[1]}`);
        }
      }
    }

    const report = {
      totalDirectories: runDirs.size,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
      details: [] as any[],
    };

    for (const runDir of Array.from(runDirs)) {
      try {
        report.processed++;

        // List files in this run directory
        const listRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runDir)}`,
          { headers, cache: "no-store" }
        );
        if (!listRes.ok) continue;

        const list = await listRes.json();
        const runFiles = (Array.isArray(list) ? list : [])
          .filter((x: any) => x.type === "file" && /run-\d+\.json$/.test(x.name))
          .sort((a: any, b: any) => {
            const na = parseInt(a.name.replace(/\D/g, ""), 10);
            const nb = parseInt(b.name.replace(/\D/g, ""), 10);
            return nb - na;
          });

        if (runFiles.length === 0) {
          report.skipped++;
          continue;
        }

        // Check if latest.json already exists
        const latestPath = `${runDir}/latest.json`;
        const latestCheckRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestPath)}`,
          { headers, cache: "no-store" }
        );
        const latestExists = latestCheckRes.ok;

        // Fetch the latest run file
        const latestRunFile = runFiles[0];
        const runRes = await fetch(latestRunFile.download_url, { cache: "no-store" });
        if (!runRes.ok) {
          report.errors.push(`Failed to fetch ${latestRunFile.path}`);
          continue;
        }
        const runData = await runRes.json();

        // Create index payload
        const indexPayload = {
          result: runData.result || "unknown",
          executed_at: runData.executed_at || new Date().toISOString(),
          executed_by: runData.executed_by || "system",
          run_file: latestRunFile.name,
          updated_at: new Date().toISOString(),
        };

        const detail: any = {
          directory: runDir,
          latestRunFile: latestRunFile.name,
          indexPayload,
        };

        if (dryRun) {
          detail.action = latestExists ? "would-update" : "would-create";
          report.details.push(detail);
          if (latestExists) report.updated++;
          else report.created++;
        } else {
          // Actually create/update latest.json
          const putBody: any = {
            message: `Backfill: ${latestExists ? "Update" : "Create"} latest run index for ${runDir}`,
            content: Buffer.from(JSON.stringify(indexPayload, null, 2)).toString("base64"),
          };

          if (latestExists) {
            const latestData = await latestCheckRes.json();
            putBody.sha = latestData.sha;
          }

          const putRes = await fetch(
            `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestPath)}`,
            {
              method: "PUT",
              headers: {
                ...headers,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(putBody),
            }
          );

          if (putRes.ok) {
            detail.action = latestExists ? "updated" : "created";
            report.details.push(detail);
            if (latestExists) report.updated++;
            else report.created++;
          } else {
            const errText = await putRes.text();
            report.errors.push(`Failed to update ${latestPath}: ${errText.substring(0, 100)}`);
            detail.action = "failed";
            detail.error = errText.substring(0, 100);
            report.details.push(detail);
          }
        }
      } catch (e: any) {
        report.errors.push(`Error processing ${runDir}: ${e.message}`);
      }
    }

    return NextResponse.json(report, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Backfill failed" },
      { status: 500 }
    );
  }
}
