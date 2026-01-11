import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import yaml from "js-yaml";
import { getRepoEnv } from "@/lib/projects";

function parseFrontmatter(content: string, filePath?: string): Record<string, any> {
  const fmMatch = content.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
  if (!fmMatch) return {};
  
  try {
    const parsed = yaml.load(fmMatch[1]) as Record<string, any>;
    return parsed || {};
  } catch (e: any) {
    const errorMsg = filePath 
      ? `Failed to parse YAML frontmatter in ${filePath}: ${e.message || e}`
      : `Failed to parse YAML frontmatter: ${e.message || e}`;
    console.error(errorMsg, e);
    // Return error info so it can be surfaced to user
    return { _parseError: errorMsg };
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = getRepoEnv(req, "testcases");
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
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
      JSON.stringify({ error: 'Invalid TESTCASES_REPO format. Use "owner/name" or a full GitHub URL.' }),
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  const ref = searchParams.get("ref");

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${session.accessToken}`,
  };

  if (path) {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}${refQuery}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  }

  // Default: list all Markdown files under qa-testcases/ (manual and Regression) using Git Trees API
  // 1) get main ref sha
  const mainRefRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`, {
    headers,
    cache: "no-store",
  });
  if (!mainRefRes.ok) {
    const text = await mainRefRes.text();
    return new Response(text, { status: mainRefRes.status });
  }
  const mainRef = await mainRefRes.json();
  const mainSha = mainRef.object.sha;

  // 2) fetch tree recursively
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${mainSha}?recursive=1`, {
    headers,
    cache: "no-store",
  });
  if (!treeRes.ok) {
    const text = await treeRes.text();
    return new Response(text, { status: treeRes.status });
  }
  const treeData = await treeRes.json();

  const map = new Map<string, any>();
  for (const entry of treeData.tree || []) {
    if (entry.type === "blob" && typeof entry.path === "string" && entry.path.startsWith("qa-testcases/") && entry.path.endsWith(".md")) {
      const pathOnly = entry.path as string;
      const nameOnly = pathOnly.split("/").pop();
      map.set(pathOnly, {
        path: pathOnly,
        name: nameOnly,
        url: `https://github.com/${owner}/${name}/blob/main/${pathOnly}`,
        title: null,
      });
    }
  }

  // Parse frontmatter title for all files (batch in groups to manage rate limits)
  const paths = Array.from(map.keys());
  const batchSize = 10;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${p}`, {
            headers,
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = await res.json();
          const content = Buffer.from(data.content || "", "base64").toString("utf-8");
          const meta = parseFrontmatter(content, p);
          const entry = map.get(p);
          
          // Check for parse errors
          if (meta._parseError) {
            console.error(`Skipping ${p} due to YAML error:`, meta._parseError);
            if (entry) {
              entry.title = `⚠️ YAML Error in file`;
              entry._parseError = meta._parseError;
            }
            return;
          }
          
          if (entry && Object.keys(meta).length) {
            if (meta.title) entry.title = meta.title;
            if (meta.story_id) entry.story_id = meta.story_id;
            if (meta.suite) entry.suite = meta.suite;
            if (meta.priority) entry.priority = meta.priority;
            if (meta.component) entry.component = meta.component;
            if (meta.preconditions) entry.preconditions = meta.preconditions;
            if (meta.data) entry.data = meta.data;
            if (meta.setup_sql) entry.setup_sql = meta.setup_sql;
            if (meta.verification_sql) entry.verification_sql = meta.verification_sql;
            if (meta.teardown_sql) entry.teardown_sql = meta.teardown_sql;
            if (meta.setup_sql_file) entry.setup_sql_file = meta.setup_sql_file;
            if (meta.verification_sql_file) entry.verification_sql_file = meta.verification_sql_file;
            if (meta.teardown_sql_file) entry.teardown_sql_file = meta.teardown_sql_file;
            if (meta.steps) entry.steps = meta.steps;
            if (meta.expected) entry.expected = meta.expected;
            if (meta.env) entry.env = meta.env;
            if (meta.app_version) entry.app_version = meta.app_version;
            if (meta.owner) entry.owner = meta.owner;
            if (meta.assigned_to) entry.assigned_to = meta.assigned_to;
            if (meta.status) entry.status = meta.status;
          }
        } catch {
          // ignore
        }
      })
    );
  }

  // Also include pending files from open PRs (added/modified under qa-testcases/manual)
  const prsRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls?state=open&per_page=50`, {
    headers,
    cache: "no-store",
  });
  if (prsRes.ok) {
    const prs = await prsRes.json();
    for (const pr of prs) {
      const filesRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls/${pr.number}/files`, {
        headers,
        cache: "no-store",
      });
      if (!filesRes.ok) continue;
      const prFiles = await filesRes.json();
      for (const f of prFiles) {
        const filename = f.filename as string;
        if (filename.startsWith("qa-testcases/") && filename.endsWith(".md")) {
          const entry = map.get(filename) || { path: filename, name: filename.split("/").pop(), url: pr.html_url, title: null };
          entry.pending = true;
          entry.ref = pr.head?.ref;
          entry.prNumber = pr.number;
          entry.prUrl = pr.html_url;
          
          // Extract title from pending PR files
          if (!entry.title && entry.ref) {
            try {
              const contentRes = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${filename}?ref=${encodeURIComponent(entry.ref)}`, {
                headers,
                cache: "no-store",
              });
              if (contentRes.ok) {
                const contentData = await contentRes.json();
                const content = Buffer.from(contentData.content || "", "base64").toString("utf-8");
                const meta = parseFrontmatter(content, filename);
                
                // Check for parse errors
                if (meta._parseError) {
                  console.error(`Skipping pending file ${filename} due to YAML error:`, meta._parseError);
                  entry.title = `⚠️ YAML Error in file`;
                  entry._parseError = meta._parseError;
                } else if (Object.keys(meta).length) {
                  if (meta.title) entry.title = meta.title;
                  if (meta.story_id) entry.story_id = meta.story_id;
                  if (meta.suite) entry.suite = meta.suite;
                  if (meta.priority) entry.priority = meta.priority;
                  if (meta.component) entry.component = meta.component;
                  if (meta.preconditions) entry.preconditions = meta.preconditions;
                  if (meta.data) entry.data = meta.data;
                  if (meta.setup_sql) entry.setup_sql = meta.setup_sql;
                  if (meta.verification_sql) entry.verification_sql = meta.verification_sql;
                  if (meta.teardown_sql) entry.teardown_sql = meta.teardown_sql;
                  if (meta.setup_sql_file) entry.setup_sql_file = meta.setup_sql_file;
                  if (meta.verification_sql_file) entry.verification_sql_file = meta.verification_sql_file;
                  if (meta.teardown_sql_file) entry.teardown_sql_file = meta.teardown_sql_file;
                  if (meta.steps) entry.steps = meta.steps;
                  if (meta.expected) entry.expected = meta.expected;
                  if (meta.env) entry.env = meta.env;
                  if (meta.app_version) entry.app_version = meta.app_version;
                  if (meta.owner) entry.owner = meta.owner;
                  if (meta.assigned_to) entry.assigned_to = meta.assigned_to;
                  if (meta.status) entry.status = meta.status;
                }
              }
            } catch {
              // ignore
            }
          }
          
          map.set(filename, entry);
        }
      }
    }
  }

  const files = Array.from(map.values());
  return new Response(JSON.stringify(files), { status: 200 });
}
