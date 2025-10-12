import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * DELETE /api/github/issues/delete
 * Delete a GitHub issue (requires delete permissions)
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = process.env.STORIES_REPO;
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
    const { issue_number } = await req.json();

    if (!issue_number) {
      return new Response(
        JSON.stringify({ error: "issue_number is required" }),
        { status: 400 }
      );
    }

    // GitHub API endpoint to delete an issue
    // Note: This requires delete permissions on the repo
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${issue_number}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Issue deleted" }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to delete issue" }),
      { status: 500 }
    );
  }
}
