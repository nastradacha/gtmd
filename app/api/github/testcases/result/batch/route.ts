import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRepoEnv } from "@/lib/projects";

/**
 * POST /api/github/testcases/result/batch
 * Submit multiple test results in a single batch
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // Use the same repo parsing as single-result endpoint
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
    const { results } = await req.json();
    
    if (!Array.isArray(results) || results.length === 0) {
      return new Response(
        JSON.stringify({ error: "results array is required" }),
        { status: 400 }
      );
    }

    // Get user info
    const meRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const meData = await meRes.json();
    const login = meData.login || "unknown";

    const successResults = [];
    const failedResults = [];

    // Process results sequentially to avoid branch SHA conflicts
    for (const testResult of results) {
      const { path, storyId, result, notes, steps } = testResult;
      
      if (!path || !result || !["pass", "fail"].includes(result)) {
        failedResults.push({
          path: path || "unknown",
          error: "Invalid result format",
        });
        continue;
      }

      try {
        const now = new Date();
        const ms = now.getTime();
        const timestamp = now.toISOString();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        
        const runDir = `qa-runs/${path.replace(/\//g, "__")}`;
        const runFilename = `run-${ms}-${randomSuffix}.json`;
        const runPath = `${runDir}/${runFilename}`;

        const payload: any = {
          path,
          storyId: storyId || null,
          result,
          notes: notes || "",
          executed_by: login,
          executed_at: timestamp,
        };
        // Optional per-step outcomes
        if (Array.isArray(steps)) {
          try {
            payload.steps = steps.map((s: any) => ({
              name: String(s?.name || "").slice(0, 500),
              result: s?.result === "pass" || s?.result === "fail" || s?.result === "skip" ? s.result : null,
              notes: String(s?.notes || ""),
            }));
          } catch {}
        }

        // Create the file with a single attempt (sequential processing avoids conflicts)
        const putRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `Record test result: ${result} by ${login}`,
              content: Buffer.from(JSON.stringify(payload, null, 2)).toString("base64"),
              branch: "main",
            }),
          }
        );

        if (putRes.ok) {
          successResults.push({
            path,
            result,
            executed_at: timestamp,
          });
        } else {
          const errorText = await putRes.text();
          failedResults.push({
            path,
            error: errorText,
            status: putRes.status,
          });
        }

        // Small delay between files to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error: any) {
        failedResults.push({
          path,
          error: error.message || "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalSubmitted: results.length,
        successful: successResults.length,
        failed: failedResults.length,
        successResults,
        failedResults,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process batch" }),
      { status: 500 }
    );
  }
}
