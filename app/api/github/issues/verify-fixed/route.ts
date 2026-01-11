import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv } from "@/lib/projects";

export const runtime = "nodejs";

/**
 * POST /api/github/issues/verify-fixed
 * Close an issue as "completed" after successful retest
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = getRepoEnv(req, "stories");
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
  }

  let owner: string | undefined;
  let name: string | undefined;

  if (repoEnv.includes("github.com")) {
    try {
      const u = new URL(repoEnv);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      owner = parts[parts.length - 2];
      name = parts[parts.length - 1];
    } catch {
      // fallthrough
    }
  } else {
    const parts = repoEnv.split("/");
    owner = parts[0];
    name = parts[1];
  }

  if (!owner || !name) {
    return new Response(
      JSON.stringify({ error: 'Invalid STORIES_REPO format' }),
      { status: 500 }
    );
  }

  try {
    const { issue_number, verification_notes } = await req.json();

    if (!issue_number) {
      return new Response(
        JSON.stringify({ error: "issue_number is required" }),
        { status: 400 }
      );
    }

    // Get user info for verification comment
    const meRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const meData = await meRes.json();
    const login = meData.login || "unknown";

    // Add verification comment
    const commentBody = `✅ **Verified Fixed**

Retested and verified by @${login} on ${new Date().toLocaleDateString()}

${verification_notes ? `**Verification Notes:**\n${verification_notes}` : ""}

*Verified via GTMD Dashboard*`;

    await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${issue_number}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: commentBody }),
      }
    );

    // Close the issue as "completed" (successfully resolved)
    const closeRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${issue_number}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: "closed",
          state_reason: "completed", // Mark as completed (vs not_planned)
        }),
      }
    );

    if (!closeRes.ok) {
      const text = await closeRes.text();
      return new Response(text, { status: closeRes.status });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Issue verified and closed as completed" 
      }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to verify issue" }),
      { status: 500 }
    );
  }
}
