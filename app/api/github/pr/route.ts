import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRepoEnv } from "@/lib/projects";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = getRepoEnv(req, "testcases");
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

  const { searchParams } = new URL(req.url);
  const number = searchParams.get("number");
  if (!number) {
    return new Response(JSON.stringify({ error: "number is required" }), { status: 400 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/pulls/${number}`,
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

  const pr = await res.json();
  return new Response(
    JSON.stringify({
      number: pr.number,
      html_url: pr.html_url,
      state: pr.state,
      merged_at: pr.merged_at,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      title: pr.title,
      user: pr.user?.login,
    }),
    { status: 200 }
  );
}
