import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHash } from "crypto";
import yaml from "js-yaml";
import { getRepoEnv } from "@/lib/projects";
import { TestCase } from "@/lib/types";

export const runtime = "nodejs";

type Frontmatter = Record<string, unknown> & { _parseError?: string };

type TestcasesIndexEntry = Omit<TestCase, "title"> & {
  title?: string | null;
  _parseError?: string;
};

function coerceString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function parseFrontmatter(content: string, filePath?: string): Frontmatter {
  const fmMatch = content.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
  if (!fmMatch) return {};
  
  try {
    const loaded = yaml.load(fmMatch[1]) as unknown;
    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) return {};
    return loaded as Record<string, unknown>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const errorMsg = filePath 
      ? `Failed to parse YAML frontmatter in ${filePath}: ${msg}`
      : `Failed to parse YAML frontmatter: ${msg}`;
    console.error(errorMsg, e);
    // Return error info so it can be surfaced to user
    return { _parseError: errorMsg };
  }
}

type TestcasesIndexCacheEntry = {
  ts: number;
  body: string;
};

const testcasesIndexCache: Map<string, TestcasesIndexCacheEntry> = new Map();
const TESTCASES_INDEX_CACHE_TTL_MS = 60_000;

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

  if (!path) {
    const tokenKey = createHash("sha256")
      .update(session.accessToken)
      .digest("hex")
      .slice(0, 16);
    const cacheKey = `${tokenKey}::${owner}/${name}`;
    const cached = testcasesIndexCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < TESTCASES_INDEX_CACHE_TTL_MS) {
      return new Response(cached.body, { status: 200 });
    }
  }

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

  const map = new Map<string, TestcasesIndexEntry>();
  for (const entry of treeData.tree || []) {
    if (entry.type === "blob" && typeof entry.path === "string" && entry.path.startsWith("qa-testcases/") && entry.path.endsWith(".md")) {
      const pathOnly = entry.path as string;
      const nameOnly = pathOnly.split("/").pop() || pathOnly;
      map.set(pathOnly, {
        path: pathOnly,
        name: nameOnly,
        url: `https://github.com/${owner}/${name}/blob/main/${pathOnly}`,
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
            const title = coerceString(meta.title);
            if (title) entry.title = title;
            const storyId = coerceString(meta.story_id);
            if (storyId) entry.story_id = storyId;
            const suite = coerceString(meta.suite);
            if (suite) entry.suite = suite;
            const priority = coerceString(meta.priority);
            if (priority) entry.priority = priority;
            const component = coerceString(meta.component);
            if (component) entry.component = component;
            const preconditions = coerceString(meta.preconditions);
            if (preconditions) entry.preconditions = preconditions;
            const dataNotes = coerceString(meta.data);
            if (dataNotes) entry.data = dataNotes;
            const setupSql = coerceString(meta.setup_sql);
            if (setupSql) entry.setup_sql = setupSql;
            const verificationSql = coerceString(meta.verification_sql);
            if (verificationSql) entry.verification_sql = verificationSql;
            const teardownSql = coerceString(meta.teardown_sql);
            if (teardownSql) entry.teardown_sql = teardownSql;
            const setupSqlFile = coerceString(meta.setup_sql_file);
            if (setupSqlFile) entry.setup_sql_file = setupSqlFile;
            const verificationSqlFile = coerceString(meta.verification_sql_file);
            if (verificationSqlFile) entry.verification_sql_file = verificationSqlFile;
            const teardownSqlFile = coerceString(meta.teardown_sql_file);
            if (teardownSqlFile) entry.teardown_sql_file = teardownSqlFile;
            const steps = coerceString(meta.steps);
            if (steps) entry.steps = steps;
            const expected = coerceString(meta.expected);
            if (expected) entry.expected = expected;
            const env = coerceString(meta.env);
            if (env) entry.env = env;
            const appVersion = coerceString(meta.app_version);
            if (appVersion) entry.app_version = appVersion;
            const ownerName = coerceString(meta.owner);
            if (ownerName) entry.owner = ownerName;
            const assignedTo = coerceString(meta.assigned_to);
            if (assignedTo) entry.assigned_to = assignedTo;
            const status = coerceString(meta.status);
            if (status) entry.status = status;
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
          const existing = map.get(filename);
          const entry: TestcasesIndexEntry =
            existing ?? { path: filename, name: filename.split("/").pop() || filename, url: pr.html_url, title: null };
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
                  const title = coerceString(meta.title);
                  if (title) entry.title = title;
                  const storyId = coerceString(meta.story_id);
                  if (storyId) entry.story_id = storyId;
                  const suite = coerceString(meta.suite);
                  if (suite) entry.suite = suite;
                  const priority = coerceString(meta.priority);
                  if (priority) entry.priority = priority;
                  const component = coerceString(meta.component);
                  if (component) entry.component = component;
                  const preconditions = coerceString(meta.preconditions);
                  if (preconditions) entry.preconditions = preconditions;
                  const dataNotes = coerceString(meta.data);
                  if (dataNotes) entry.data = dataNotes;
                  const setupSql = coerceString(meta.setup_sql);
                  if (setupSql) entry.setup_sql = setupSql;
                  const verificationSql = coerceString(meta.verification_sql);
                  if (verificationSql) entry.verification_sql = verificationSql;
                  const teardownSql = coerceString(meta.teardown_sql);
                  if (teardownSql) entry.teardown_sql = teardownSql;
                  const setupSqlFile = coerceString(meta.setup_sql_file);
                  if (setupSqlFile) entry.setup_sql_file = setupSqlFile;
                  const verificationSqlFile = coerceString(meta.verification_sql_file);
                  if (verificationSqlFile) entry.verification_sql_file = verificationSqlFile;
                  const teardownSqlFile = coerceString(meta.teardown_sql_file);
                  if (teardownSqlFile) entry.teardown_sql_file = teardownSqlFile;
                  const steps = coerceString(meta.steps);
                  if (steps) entry.steps = steps;
                  const expected = coerceString(meta.expected);
                  if (expected) entry.expected = expected;
                  const env = coerceString(meta.env);
                  if (env) entry.env = env;
                  const appVersion = coerceString(meta.app_version);
                  if (appVersion) entry.app_version = appVersion;
                  const ownerName = coerceString(meta.owner);
                  if (ownerName) entry.owner = ownerName;
                  const assignedTo = coerceString(meta.assigned_to);
                  if (assignedTo) entry.assigned_to = assignedTo;
                  const status = coerceString(meta.status);
                  if (status) entry.status = status;
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

  const tokenKey = createHash("sha256")
    .update(session.accessToken)
    .digest("hex")
    .slice(0, 16);
  const cacheKey = `${tokenKey}::${owner}/${name}`;
  const body = JSON.stringify(files);
  testcasesIndexCache.set(cacheKey, { ts: Date.now(), body });
  return new Response(body, { status: 200 });
}
