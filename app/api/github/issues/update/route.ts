import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

function parseRepo(repoEnv?: string): { owner: string; name: string } | null {
  if (!repoEnv) return null;
  if (repoEnv.includes("github.com")) {
    try {
      const u = new URL(repoEnv);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      return { owner: parts[parts.length - 2], name: parts[parts.length - 1] };
    } catch {
      return null;
    }
  }
  const parts = repoEnv.split("/");
  return parts.length >= 2 ? { owner: parts[0], name: parts[1] } : null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoParsed = parseRepo(process.env.STORIES_REPO);
  if (!repoParsed) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
  }

  try {
    const { issue_number, title, body, labels, state } = await req.json();
    if (!issue_number) {
      return new Response(JSON.stringify({ error: "issue_number is required" }), { status: 400 });
    }

    const patchBody: any = {};
    if (typeof title === "string") patchBody.title = title;
    if (typeof body === "string") patchBody.body = body;
    if (Array.isArray(labels)) patchBody.labels = labels;
    if (state === "open" || state === "closed") patchBody.state = state;

    // Update the issue
    const patchRes = await fetch(
      `https://api.github.com/repos/${repoParsed.owner}/${repoParsed.name}/issues/${issue_number}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchBody),
      }
    );

    if (!patchRes.ok) {
      const text = await patchRes.text();
      return new Response(text, { status: patchRes.status });
    }

    const updatedIssue = await patchRes.json();

    // Audit comment with editor and fields updated
    const meRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const meData = await meRes.json();
    const login = meData?.login || "unknown";
    const timestamp = new Date().toISOString();

    const changedFields = Object.keys(patchBody);
    const commentBody = `Edited by @${login} on ${timestamp}. Updated fields: ${changedFields.join(", ") || "(none)"}.`;

    await fetch(
      `https://api.github.com/repos/${repoParsed.owner}/${repoParsed.name}/issues/${issue_number}/comments`,
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

    return new Response(JSON.stringify({ success: true, issue: updatedIssue }), { status: 200 });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to update issue" }),
      { status: 500 }
    );
  }
}
