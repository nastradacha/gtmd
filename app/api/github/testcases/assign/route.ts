import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const { path, assignee, ref } = await req.json();
  if (!path) {
    return new Response(JSON.stringify({ error: "Missing path" }), { status: 400 });
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
    // Fetch current file content
    const branch = ref || "main";
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${branch}`,
      { headers, cache: "no-store" }
    );

    if (!fileRes.ok) {
      const text = await fileRes.text();
      return new Response(text, { status: fileRes.status });
    }

    const fileData = await fileRes.json();
    const content = Buffer.from(fileData.content || "", "base64").toString("utf-8");

    // Parse and update frontmatter
    const fmMatch = content.match(/^(---\s*\r?\n)([\s\S]+?)(\r?\n---\s*\r?\n)([\s\S]*)$/);
    if (!fmMatch) {
      return new Response(
        JSON.stringify({ error: "Invalid frontmatter format" }),
        { status: 400 }
      );
    }

    const frontmatter = fmMatch[2];
    const body = fmMatch[4];
    const lines = frontmatter.split('\n');
    
    // Remove existing assigned_to line
    const filteredLines = lines.filter(line => !line.match(/^assigned_to:/));
    
    // Add new assigned_to line if assignee is provided
    if (assignee) {
      filteredLines.push(`assigned_to: "${assignee}"`);
    }

    const newFrontmatter = filteredLines.join('\n');
    const newContent = `---\n${newFrontmatter}\n---\n${body}`;

    // Create a branch and PR for the update
    const ms = Date.now();
    const branchName = `assign-testcase-${ms}`;
    const user = session.user as any;
    const username = user?.login || "unknown";

    // Get main branch SHA
    const mainRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`,
      { headers, cache: "no-store" }
    );
    if (!mainRefRes.ok) {
      const text = await mainRefRes.text();
      return new Response(text, { status: mainRefRes.status });
    }
    const mainRef = await mainRefRes.json();
    const mainSha = mainRef.object.sha;

    // Create new branch
    const createBranchRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/refs`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: mainSha,
        }),
        cache: "no-store",
      }
    );
    if (!createBranchRes.ok) {
      const text = await createBranchRes.text();
      return new Response(text, { status: createBranchRes.status });
    }

    // Update file on new branch
    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${path}`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: assignee 
            ? `Assign test case to @${assignee}` 
            : `Unassign test case`,
          content: Buffer.from(newContent).toString("base64"),
          sha: fileData.sha,
          branch: branchName,
        }),
        cache: "no-store",
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      return new Response(text, { status: updateRes.status });
    }

    // Create PR
    const prRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/pulls`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: assignee 
            ? `Assign test case to @${assignee}` 
            : `Unassign test case`,
          head: branchName,
          base: "main",
          body: assignee
            ? `Assignment of test case \`${path}\` to @${assignee} by @${username}`
            : `Unassignment of test case \`${path}\` by @${username}`,
        }),
        cache: "no-store",
      }
    );

    if (!prRes.ok) {
      const text = await prRes.text();
      return new Response(text, { status: prRes.status });
    }

    const pr = await prRes.json();
    return new Response(
      JSON.stringify({
        success: true,
        prNumber: pr.number,
        prUrl: pr.html_url,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
