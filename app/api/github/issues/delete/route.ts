import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv } from "@/lib/projects";

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
    const { issue_number } = await req.json();

    if (!issue_number) {
      return new Response(
        JSON.stringify({ error: "issue_number is required" }),
        { status: 400 }
      );
    }

    // GitHub doesn't support deleting issues via API
    // Instead, we close it and add a "test" label so it can be filtered out
    
    // First, get the current issue to preserve existing labels
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues/${issue_number}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!getRes.ok) {
      const text = await getRes.text();
      return new Response(text, { status: getRes.status });
    }

    const issue = await getRes.json();
    const currentLabels = issue.labels.map((l: any) => l.name);
    
    // Add "test" label if not already present
    const updatedLabels = currentLabels.includes("test") 
      ? currentLabels 
      : [...currentLabels, "test"];

    // Close the issue and add "test" label
    const patchRes = await fetch(
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
          labels: updatedLabels,
          state_reason: "not_planned", // Mark as not planned (vs completed)
        }),
      }
    );

    if (!patchRes.ok) {
      const text = await patchRes.text();
      return new Response(text, { status: patchRes.status });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Issue closed and marked as 'test'" 
      }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to delete issue" }),
      { status: 500 }
    );
  }
}
