import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
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
      JSON.stringify({ error: 'Invalid TESTCASES_REPO format' }),
      { status: 500 }
    );
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${session.accessToken}`,
  };

  try {
    // Fetch collaborators
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/collaborators?per_page=100`,
      { headers, cache: "no-store" }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }

    const collaborators = await res.json();
    
    // Return simplified collaborator data
    const simplified = collaborators.map((collab: any) => ({
      login: collab.login,
      avatar_url: collab.avatar_url,
      name: collab.name || collab.login,
    }));

    return new Response(JSON.stringify(simplified), { status: 200 });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
