import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRepoEnv } from "@/lib/projects";

// Simple in-memory cache for the matrix payload
let matrixCache: Map<string, { data: any; ts: number }> = new Map();
const MATRIX_CACHE_TTL_MS = 60_000; // 60 seconds

function parseRepoEnv(repoEnv: string) {
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
  if (!owner || !name) throw new Error("Invalid repo format");
  return { owner, name };
}

function parseYamlFrontmatter(markdown: string) {
  const fmMatch = markdown.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
  if (!fmMatch) return {} as Record<string, string>;
  const block = fmMatch[1];
  const meta: Record<string, string> = {};
  block.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^(\w[\w_-]*):\s*(?:["'](.+?)["']|(.+?))\s*$/);
    if (m) meta[m[1]] = (m[2] || m[3] || "").trim();
  });
  return meta;
}

function parseDefectLinks(body: string | null | undefined) {
  const result: { story_id?: string; test_case?: string } = {};
  if (!body) return result;
  // Try YAML frontmatter
  const fmMatch = body.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
  if (fmMatch) {
    const meta = parseYamlFrontmatter(body);
    if (meta.story_id) result.story_id = meta.story_id;
    if (meta.test_case) result.test_case = meta.test_case;
  }
  // Fallback regexes
  if (!result.story_id) {
    const m = body.match(/story[_\s-]?id\s*:\s*([^\n\r]+)/i);
    if (m) result.story_id = m[1].trim();
  }
  if (!result.test_case) {
    const m2 = body.match(/(qa-testcases\/[\w\-_/]+\.md)/i);
    if (m2) result.test_case = m2[1];
  }
  return result;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const nocache = /^(1|true)$/i.test(searchParams.get("nocache") || "");

  const STORIES_REPO = getRepoEnv(req, "stories");
  const TESTCASES_REPO = getRepoEnv(req, "testcases");
  if (!STORIES_REPO || !TESTCASES_REPO) {
    return new Response(JSON.stringify({ error: "Missing STORIES_REPO or TESTCASES_REPO" }), { status: 500 });
  }

  const cacheKey = `${STORIES_REPO}::${TESTCASES_REPO}`;
  const cached = matrixCache.get(cacheKey);
  if (!nocache && cached && Date.now() - cached.ts < MATRIX_CACHE_TTL_MS) {
    return new Response(
      JSON.stringify(cached.data, null, 2),
      { status: 200, headers: { "Content-Type": "application/json", "X-Cache": "HIT" } }
    );
  }

  let storiesOwner: string, storiesName: string;
  let testsOwner: string, testsName: string;
  try {
    ({ owner: storiesOwner, name: storiesName } = parseRepoEnv(STORIES_REPO));
    ({ owner: testsOwner, name: testsName } = parseRepoEnv(TESTCASES_REPO));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Invalid repo env" }), { status: 500 });
  }

  const ghHeaders = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: "application/vnd.github+json",
  };

  try {
    // 1) Fetch issues (stories + defects) from STORIES_REPO
    const issuesParams = new URLSearchParams({ state: "all", per_page: "100" });
    const issuesRes = await fetch(
      `https://api.github.com/repos/${storiesOwner}/${storiesName}/issues?${issuesParams}`,
      { headers: ghHeaders, cache: "no-store" }
    );
    if (!issuesRes.ok) {
      return new Response(await issuesRes.text(), { status: issuesRes.status });
    }
    const allIssues = await issuesRes.json();
    const issuesOnly = (allIssues || []).filter((it: any) => !it.pull_request);
    const defects = issuesOnly.filter((it: any) => it.labels?.some((l: any) => (l.name || "").toLowerCase() === "bug"));
    const stories = issuesOnly.filter((it: any) => !it.labels?.some((l: any) => (l.name || "").toLowerCase() === "bug"));

    // Helper to extract numeric ID from various formats (MS-001 -> 1, US-V-002 -> 2, etc.)
    function extractNumericId(storyId: string | number): string | null {
      if (!storyId) return null;
      const str = String(storyId);
      // Match any number in the string
      const match = str.match(/\d+/);
      if (match) {
        // Convert to number and back to remove leading zeros
        return String(parseInt(match[0], 10));
      }
      return null;
    }

    // Helper to extract custom story ID from story (e.g., "MS-005", "US-V-001")
    function extractCustomStoryId(story: any): string | null {
      // Try to find story ID in GitHub issue title (common pattern: "MS-005 · Story Title" or "MS-005: Story Title")
      if (story.title) {
        const titleMatch = story.title.match(/^((?:MS|US(?:-V)?)-\d+)\s*[·:·]/);
        if (titleMatch) return titleMatch[1];
      }
      
      // Try YAML frontmatter in body
      if (story.body) {
        const fmMatch = story.body.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
        if (fmMatch) {
          const meta = parseYamlFrontmatter(story.body);
          if (meta.story_id) return meta.story_id;
          if (meta.id) return meta.id;
        }
        
        // Try common patterns in body
        const idMatch = story.body.match(/(?:story[_\s-]?id|^id)\s*:\s*((?:MS|US(?:-V)?)-\d+)/im);
        if (idMatch) return idMatch[1];
      }
      
      return null;
    }

    // Parse custom story IDs and attach to story objects
    for (const s of stories) {
      const customId = extractCustomStoryId(s);
      s._customId = customId; // Store for later use
    }

    // Build story index by numeric ID AND custom ID for flexible matching
    const storyIndex = new Map<string, any>();
    for (const s of stories) {
      const numStr = String(s.number);
      storyIndex.set(numStr, s);
      storyIndex.set(`US-${numStr}`, s);
      storyIndex.set(`#${numStr}`, s);
      storyIndex.set(`MS-${numStr}`, s); // Support MS prefix
      storyIndex.set(`US-V-${numStr}`, s); // Support US-V prefix
      
      // Add custom ID to index if present
      if (s._customId) {
        storyIndex.set(s._customId, s);
      }
    }

    // 2) Fetch test cases from TESTCASES_REPO main
    const mainRefRes = await fetch(`https://api.github.com/repos/${testsOwner}/${testsName}/git/ref/heads/main`, {
      headers: ghHeaders,
      cache: "no-store",
    });
    if (!mainRefRes.ok) {
      return new Response(await mainRefRes.text(), { status: mainRefRes.status });
    }
    const mainRef = await mainRefRes.json();
    const mainSha = mainRef.object.sha;

    const treeRes = await fetch(
      `https://api.github.com/repos/${testsOwner}/${testsName}/git/trees/${mainSha}?recursive=1`,
      { headers: ghHeaders, cache: "no-store" }
    );
    if (!treeRes.ok) {
      return new Response(await treeRes.text(), { status: treeRes.status });
    }
    const treeData = await treeRes.json();

    const testFiles: string[] = [];
    const runFiles: { path: string; ms: number; runDir: string }[] = [];
    for (const entry of treeData.tree || []) {
      if (entry.type === "blob" && typeof entry.path === "string") {
        const p = entry.path as string;
        if (p.startsWith("qa-testcases/") && p.endsWith(".md")) {
          testFiles.push(p);
        }
        if (p.startsWith("qa-runs/") && /run-\d+(-[a-z0-9]+)?\.json$/.test(p)) {
          const runDir = p.substring(0, p.lastIndexOf("/"));
          const msMatch = p.match(/run-(\d+)(?:-[a-z0-9]+)?\.json$/);
          const ms = msMatch ? parseInt(msMatch[1], 10) : 0;
          runFiles.push({ path: p, ms, runDir });
        }
      }
    }

    // 2a) Fetch and parse test case frontmatter in batches
    type TestCaseLite = {
      path: string;
      name: string;
      url: string;
      title?: string;
      story_id?: string;
      assigned_to?: string;
      suite?: string;
      priority?: string;
      component?: string;
      status?: string;
    };

    const testCases: TestCaseLite[] = testFiles.map((p) => ({
      path: p,
      name: p.split("/").pop() || p,
      url: `https://github.com/${testsOwner}/${testsName}/blob/main/${p}`,
    }));

    const batchSize = 10;
    for (let i = 0; i < testCases.length; i += batchSize) {
      const batch = testCases.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (tc) => {
          try {
            const res = await fetch(
              `https://api.github.com/repos/${testsOwner}/${testsName}/contents/${encodeURIComponent(tc.path)}`,
              { headers: ghHeaders, cache: "no-store" }
            );
            if (!res.ok) return;
            const data = await res.json();
            const content = Buffer.from(data.content || "", "base64").toString("utf-8");
            const meta = parseYamlFrontmatter(content);
            if (meta.title) tc.title = meta.title;
            if (meta.assigned_to) tc.assigned_to = meta.assigned_to;
            if (meta.story_id) tc.story_id = meta.story_id;
            if (meta.suite) tc.suite = meta.suite;
            if (meta.priority) tc.priority = meta.priority;
            if (meta.component) tc.component = meta.component;
            if (meta.status) tc.status = meta.status;
          } catch {}
        })
      );
    }

    // 3) Compute latest run per test path using latest.json index when available
    const latestByPath = new Map<string, { result: string; executed_at: string; executed_by: string }>();
    
    // Group run directories
    const runDirs = new Set<string>();
    for (const rf of runFiles) {
      runDirs.add(rf.runDir);
    }

    // Try to read latest.json for each run directory
    const runDirArray = Array.from(runDirs);
    for (let i = 0; i < runDirArray.length; i += batchSize) {
      const batch = runDirArray.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (runDir) => {
          const latestPath = `${runDir}/latest.json`;
          const encoded = runDir.replace(/^qa-runs\//, "");
          const testPath = encoded.replace(/__/g, "/");
          
          try {
            // Try to fetch latest.json first
            const latestRes = await fetch(
              `https://api.github.com/repos/${testsOwner}/${testsName}/contents/${encodeURIComponent(latestPath)}`,
              { headers: ghHeaders, cache: "no-store" }
            );
            
            if (latestRes.ok) {
              // Use latest.json index
              const latestData = await latestRes.json();
              const json = JSON.parse(Buffer.from(latestData.content || "", "base64").toString("utf-8"));
              latestByPath.set(testPath, {
                result: (json.result || "").toLowerCase(),
                executed_at: json.executed_at || "",
                executed_by: json.executed_by || "",
              });
            } else {
              // Fallback: scan for latest run file
              const runsInDir = runFiles.filter(rf => rf.runDir === runDir);
              if (runsInDir.length === 0) return;
              
              const latest = runsInDir.reduce((max, rf) => rf.ms > max.ms ? rf : max);
              const runRes = await fetch(
                `https://api.github.com/repos/${testsOwner}/${testsName}/contents/${encodeURIComponent(latest.path)}`,
                { headers: ghHeaders, cache: "no-store" }
              );
              
              if (runRes.ok) {
                const runData = await runRes.json();
                const json = JSON.parse(Buffer.from(runData.content || "", "base64").toString("utf-8"));
                latestByPath.set(testPath, {
                  result: (json.result || "").toLowerCase(),
                  executed_at: json.executed_at || "",
                  executed_by: json.executed_by || "",
                });
              }
            }
          } catch {}
        })
      );
    }

    // 4) Link test cases to stories and defects
    const storiesOut: any[] = [];

    // Pre-parse defects links
    const defectsOut = defects.map((d: any) => {
      const links = parseDefectLinks(d.body || "");
      return { ...d, _links: links };
    });

    // Index defects by story_id and by test_case
    const defectsByStory = new Map<string, any[]>();
    const defectsByTest = new Map<string, any[]>();
    for (const d of defectsOut) {
      if (d._links?.story_id) {
        const key = (d._links.story_id + "").trim();
        const arr = defectsByStory.get(key) || [];
        arr.push(d);
        defectsByStory.set(key, arr);
        
        // Also index by extracted numeric ID for flexible matching
        const numericId = extractNumericId(key);
        if (numericId) {
          const arr2 = defectsByStory.get(numericId) || [];
          arr2.push(d);
          defectsByStory.set(numericId, arr2);
        }
      }
      if (d._links?.test_case) {
        const key2 = (d._links.test_case + "").trim();
        const arr2 = defectsByTest.get(key2) || [];
        arr2.push(d);
        defectsByTest.set(key2, arr2);
      }
    }

    // Build coverage per story
    const gaps = {
      storiesWithoutTests: [] as number[],
      testCasesWithoutStory: [] as string[],
      defectsWithoutLink: [] as number[],
    };

    // Test cases without story
    for (const tc of testCases) {
      if (!tc.story_id) gaps.testCasesWithoutStory.push(tc.path);
    }

    // Defects without link
    for (const d of defectsOut) {
      if (!d._links?.story_id && !d._links?.test_case) gaps.defectsWithoutLink.push(d.number);
    }

    for (const s of stories) {
      const numStr = String(s.number);
      const keys = new Set([numStr, `US-${numStr}`, `#${numStr}`, `MS-${numStr}`, `US-V-${numStr}`]);
      
      // Add custom story ID to keys if present
      if (s._customId) {
        keys.add(s._customId);
      }
      
      const testsForStory = testCases.filter((tc) => {
        if (!tc.story_id) return false;
        const storyIdStr = String(tc.story_id);
        
        // 1. Direct match (including custom ID like "MS-005")
        if (keys.has(storyIdStr)) return true;
        
        // 2. Check against custom ID directly
        if (s._customId && storyIdStr === s._customId) return true;
        
        // 3. Fallback: Extract numeric part and match (e.g., MS-001 -> 1 matches story #1)
        // Only use this if story doesn't have a custom ID to avoid false matches
        if (!s._customId) {
          const extractedNum = extractNumericId(storyIdStr);
          if (extractedNum === numStr) return true;
        }
        
        return false;
      });

      if (testsForStory.length === 0) {
        gaps.storiesWithoutTests.push(s.number);
      }

      const testsDetailed = testsForStory.map((tc) => {
        const latest = latestByPath.get(tc.path) || null;
        const defectsForTest = defectsByTest.get(tc.path) || [];
        return {
          path: tc.path,
          title: tc.title || tc.name,
          assigned_to: tc.assigned_to || null,
          suite: tc.suite || null,
          priority: tc.priority || null,
          latestRun: latest,
          defects: defectsForTest.map((d) => ({ number: d.number, title: d.title, state: d.state, url: d.html_url })),
          url: tc.url,
        };
      });

      const metrics = {
        testCount: testsDetailed.length,
        pass: testsDetailed.filter((t) => t.latestRun && t.latestRun.result === "pass").length,
        fail: testsDetailed.filter((t) => t.latestRun && t.latestRun.result === "fail").length,
        noRun: testsDetailed.filter((t) => !t.latestRun || !["pass", "fail"].includes(t.latestRun.result)).length,
      };

      const defectsForStory = ([] as any[])
        .concat(...Array.from(keys).map((k) => defectsByStory.get(k) || []))
        .map((d) => ({ number: d.number, title: d.title, state: d.state, url: d.html_url }));

      storiesOut.push({
        number: s.number,
        key: s._customId || `US-${s.number}`, // Use custom ID if available, otherwise GitHub issue number
        customId: s._customId || null, // Expose custom ID separately
        title: s.title,
        url: s.html_url,
        assignees: s.assignees?.map((a: any) => a.login) || [],
        labels: (s.labels || []).map((l: any) => ({ name: l.name, color: l.color })),
        milestone: s.milestone?.title || null,
        tests: testsDetailed,
        defects: defectsForStory,
        metrics: {
          ...metrics,
          coveragePercent: metrics.testCount > 0 ? Math.round((metrics.pass / metrics.testCount) * 1000) / 10 : 0,
        },
      });
    }

    const payload = { stories: storiesOut, gaps };
    matrixCache.set(cacheKey, { data: payload, ts: Date.now() });
    return new Response(
      JSON.stringify(payload, null, 2),
      { status: 200, headers: { "Content-Type": "application/json", "X-Cache": "MISS" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Failed to build matrix" }), { status: 500 });
  }
}
