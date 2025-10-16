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
    const { path, storyId, result, notes, steps } = await req.json();
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
    let runFilename = `run-${ms}-${randomSuffix}.json`;
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

    // Helper function to create file with retry on branch SHA conflicts
    async function createFileWithRetry(maxAttempts = 3): Promise<Response> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const putBody: any = {
          message: `Record test result: ${result} by ${login}`,
          content: Buffer.from(JSON.stringify(payload, null, 2)).toString("base64"),
          branch: "main",
        };

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

        // Success!
        if (putRes.ok) {
          return putRes;
        }

        // If not 409, return error immediately
        if (putRes.status !== 409) {
          return putRes;
        }

        // If last attempt, return the error
        if (attempt === maxAttempts) {
          console.log(`Failed after ${maxAttempts} attempts`);
          return putRes;
        }

        // 409 conflict - wait and retry with exponential backoff
        const waitMs = Math.min(100 * Math.pow(2, attempt - 1), 1000); // 100ms, 200ms, 400ms, max 1s
        console.log(`Attempt ${attempt} failed with 409, retrying in ${waitMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      // Should never reach here, but TypeScript needs it
      throw new Error("Unexpected retry loop exit");
    }

    let putRes = await createFileWithRetry(5); // Try up to 5 times
    
    // If 409 conflict, verify file exists before treating as success
    if (putRes.status === 409) {
      const errorText = await putRes.text();
      console.log("409 conflict on initial request:", errorText);
      console.log("Attempted path:", runPath);
      console.log("Checking if file actually exists...");
      const verifyRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runPath)}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );
      
      if (verifyRes.ok) {
        // File exists, parallel request created it - treat as success
        console.log("File exists, parallel request handled it");
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Test result recorded by parallel request`,
            path,
            result,
            executed_at: timestamp,
            note: "File created by concurrent request"
          }),
          { status: 201 }
        );
      } else {
        // File doesn't exist but got 409 - GitHub issue, try with new filename
        console.log("File doesn't exist despite 409, trying new filename...");
        const extraRandom = Math.random().toString(36).substring(2, 8);
        runFilename = `run-${ms}-${randomSuffix}-${extraRandom}.json`;
        const newRunPath = `${runDir}/${runFilename}`;
        
        const retryRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(newRunPath)}`,
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
        
        if (!retryRes.ok) {
          const text = await retryRes.text();
          console.error("Retry with new filename also failed:", retryRes.status, text);
          
          // Parse error to understand what's happening
          try {
            const errorData = JSON.parse(text);
            console.error("GitHub error details:", errorData);
          } catch (e) {
            console.error("Could not parse error response");
          }
          
          return new Response(
            JSON.stringify({
              error: "Failed to create test run after retry",
              details: text,
              status: retryRes.status,
              path: runPath,
              newPath: newRunPath
            }),
            { status: retryRes.status }
          );
        }
        
        putRes = retryRes; // Continue with successful response
      }
    }
    
    // If other error, return it
    if (!putRes.ok) {
      const text = await putRes.text();
      return new Response(text, { status: putRes.status });
    }

    // Skip latest.json update during bulk submissions to avoid race conditions
    // The traceability matrix will scan all run files anyway
    // TODO: Add a background job to update latest.json indices after bulk sessions

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
