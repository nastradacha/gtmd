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
    // Encode path: replace / with __ (dots are allowed in filenames)
    const runDir = `qa-runs/${path.replace(/\//g, "__")}`;
    const runFilename = `run-${ms}.json`;
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
        .filter((x: any) => x.type === "file" && /run-\d+\.json$/.test(x.name))
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

    // Create result file directly on main (no PR needed for automated test results)
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
          branch: "main", // Commit directly to main
        }),
      }
    );
    if (!putRes.ok) {
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
