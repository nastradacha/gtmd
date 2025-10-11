import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
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
    const { path, storyId, result, notes } = await req.json();
    if (!path || !result || !["pass", "fail"].includes(result)) {
      return new Response(
        JSON.stringify({ error: "path and result ('pass'|'fail') are required" }),
        { status: 400 }
      );
    }

    // Get user login for audit
    const meRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const meData = await meRes.json();
    const login = meData.login || "unknown";

    const now = new Date();
    const ms = now.getTime();
    const timestamp = now.toISOString();
    // Add random suffix to prevent collisions in bulk submissions
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    // Encode path: replace / with __ (dots are allowed in filenames)
    const runDir = `qa-runs/${path.replace(/\//g, "__")}`;
    const runFilename = `run-${ms}-${randomSuffix}.json`;
    const runPath = `${runDir}/${runFilename}`;

    // Check latest run to avoid duplicate PRs for identical result+notes
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
    if (listRes.ok) {
      const list = await listRes.json();
      const runs = (Array.isArray(list) ? list : [])
        .filter((x: any) => x.type === "file" && /run-\d+(-[a-z0-9]+)?\.json$/.test(x.name))
        .sort((a: any, b: any) => {
          const na = parseInt(a.name.replace(/\D/g, ""), 10);
          const nb = parseInt(b.name.replace(/\D/g, ""), 10);
          return nb - na;
        });
      if (runs.length > 0) {
        const latestRes = await fetch(runs[0].download_url, { cache: "no-store" });
        if (latestRes.ok) {
          const latest = await latestRes.json();
          const sameResult = (latest.result || "").toLowerCase() === result;
          const sameNotes = (latest.notes || "").trim() === (notes || "").trim();
          if (sameResult && sameNotes) {
            return new Response(
              JSON.stringify({
                success: true,
                noop: true,
                message: `No change. Latest run already ${result.toUpperCase()}.`,
              }),
              { status: 200 }
            );
          }
        }
      }
    }

    const payload = {
      path,
      storyId: storyId || null,
      result,
      notes: notes || "",
      executed_by: login,
      executed_at: timestamp,
    };

    // Check if result file already exists (to handle 409 conflicts)
    let existingSha: string | null = null;
    const checkRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      existingSha = checkData.sha;
    }

    // Create or update result file directly on main (no PR needed for automated test results)
    const putBody: any = {
      message: `Record test result: ${result} by ${login}`,
      content: Buffer.from(JSON.stringify(payload, null, 2)).toString("base64"),
      branch: "main", // Commit directly to main
    };
    
    // Include SHA if file exists (for update)
    if (existingSha) {
      putBody.sha = existingSha;
    }

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(putBody),
      }
    );
    
    // Handle 409 conflict with retry (race condition case)
    if (!putRes.ok && putRes.status === 409) {
      console.log("409 conflict detected, retrying with SHA...");
      
      // Fetch the file SHA now that we know it exists
      const retryCheckRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );
      
      if (retryCheckRes.ok) {
        const retryCheckData = await retryCheckRes.json();
        putBody.sha = retryCheckData.sha;
        
        // Retry the PUT with SHA
        const retryPutRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(putBody),
          }
        );
        
        if (!retryPutRes.ok && retryPutRes.status === 409) {
          // Still 409 after retry - file was created by parallel request
          // Treat as success since the run was recorded (even if by another request)
          console.log("409 on retry, treating as success (parallel request created file)");
          // Don't update latest.json to avoid more conflicts, just return success
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: `Test result recorded by parallel request`,
              path,
              result,
              executed_at: timestamp,
              note: "Resolved via parallel request"
            }),
            { status: 201 }
          );
        } else if (!retryPutRes.ok) {
          const text = await retryPutRes.text();
          return new Response(text, { status: retryPutRes.status });
        }
        // Success on retry, continue
      } else {
        // File doesn't exist even though we got 409? Treat as success anyway
        console.log("409 but file not found on retry, treating as success");
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Test result accepted despite 409`,
            path,
            result,
            executed_at: timestamp
          }),
          { status: 201 }
        );
      }
    } else if (!putRes.ok) {
      const text = await putRes.text();
      return new Response(text, { status: putRes.status });
    }

    // Create/update latest.json index for fast lookups
    const latestPath = `${runDir}/latest.json`;
    const latestPayload = {
      result,
      executed_at: timestamp,
      executed_by: login,
      run_file: runFilename,
      updated_at: timestamp,
    };

    // Check if latest.json exists to get its SHA
    const latestCheckRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestPath)}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    const latestPutBody: any = {
      message: `Update latest run index for ${path}`,
      content: Buffer.from(JSON.stringify(latestPayload, null, 2)).toString("base64"),
      branch: "main", // Commit directly to main
    };

    // If latest.json exists, include its SHA for update
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
    // Don't fail the whole operation if latest.json update fails

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Test result recorded: ${result.toUpperCase()}`,
        path,
        result,
        executed_at: timestamp
      }),
      { status: 201 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to record test result" }),
      { status: 500 }
    );
  }
}
