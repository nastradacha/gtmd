import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv } from "@/lib/projects";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = getRepoEnv(req, "stories");
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
  }

  // Parse owner/name from repo env
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
      JSON.stringify({ error: 'Invalid STORIES_REPO format. Use "owner/name" or a full GitHub URL.' }),
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const number = searchParams.get("number");
  const search = searchParams.get("search");

  try {
    // If number is provided, try to fetch specific issue
    if (number) {
      // First try direct number lookup
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/issues/${number}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        }
      );

      if (res.ok) {
        const data = await res.json();
        return new Response(JSON.stringify(data), { status: 200 });
      }

      // If direct lookup fails, search by title prefix (e.g., MS-005, US-V-005)
      // Fetch all open issues and search by title
      const allIssuesRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/issues?state=all&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        }
      );

      if (allIssuesRes.ok) {
        const issues = await allIssuesRes.json();
        // Search for issue with title starting with the number pattern
        const found = issues.find((issue: any) => {
          const title = issue.title.toLowerCase();
          const searchPattern = number.toLowerCase();
          // Match MS-005, US-V-005, etc. at the start of the title
          return title.startsWith(searchPattern) || 
                 title.match(new RegExp(`^${searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\s-]`, 'i'));
        });

        if (found) {
          return new Response(JSON.stringify(found), { status: 200 });
        }
      }

      return new Response(
        JSON.stringify({ error: `No story found with ID #${number}` }),
        { status: 404 }
      );
    }

    // If search parameter is provided, search by title
    if (search) {
      const allIssuesRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/issues?state=all&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        }
      );

      if (allIssuesRes.ok) {
        const issues = await allIssuesRes.json();
        const filtered = issues.filter((issue: any) => 
          issue.title.toLowerCase().includes(search.toLowerCase())
        );
        return new Response(JSON.stringify(filtered), { status: 200 });
      }
    }

    // Default: return all issues
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues?state=all&per_page=100`,
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
      JSON.stringify({ error: "Failed to fetch story" }),
      { status: 500 }
    );
  }
}
