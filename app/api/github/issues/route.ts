import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = process.env.STORIES_REPO;
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
  }

  // Support both "owner/name" and a full GitHub URL
  let owner: string | undefined;
  let name: string | undefined;

  if (repoEnv.includes("github.com")) {
    try {
      const u = new URL(repoEnv);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      owner = parts[parts.length - 2];
      name = parts[parts.length - 1];
    } catch {
      // fallthrough to validation below
    }
  } else {
    const parts = repoEnv.split("/");
    owner = parts[0];
    name = parts[1];
  }

  if (!owner || !name) {
    return new Response(
      JSON.stringify({ error: 'Invalid STORIES_REPO format. Use "owner/name" or a full GitHub URL.' }),
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") || "all";
  const labels = searchParams.get("labels") || "";
  const milestone = searchParams.get("milestone") || "";
  const assignee = searchParams.get("assignee") || "";
  const params = new URLSearchParams({ state, per_page: "100" });
  if (labels) params.append("labels", labels);
  if (milestone) params.append("milestone", milestone);
  if (assignee) params.append("assignee", assignee);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues?${params}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch issues" }),
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = process.env.STORIES_REPO;
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
  }

  // Support both "owner/name" and a full GitHub URL
  let owner: string | undefined;
  let name: string | undefined;

  if (repoEnv.includes("github.com")) {
    try {
      const u = new URL(repoEnv);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      owner = parts[parts.length - 2];
      name = parts[parts.length - 1];
    } catch {
      // fallthrough to validation below
    }
  } else {
    const parts = repoEnv.split("/");
    owner = parts[0];
    name = parts[1];
  }

  if (!owner || !name) {
    return new Response(
      JSON.stringify({ error: 'Invalid STORIES_REPO format. Use "owner/name" or a full GitHub URL.' }),
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 201 });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to create issue" }),
      { status: 500 }
    );
  }
}
