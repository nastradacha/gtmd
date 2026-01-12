import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRepoEnv } from "@/lib/projects";
import { createHash } from "crypto";

export const runtime = "nodejs";

type TestcaseRunsCacheEntry = {
  ts: number;
  body: string;
};

const testcaseRunsCache: Map<string, TestcaseRunsCacheEntry> = new Map();
const TESTCASE_RUNS_CACHE_TTL_MS = 60_000;

const RUN_FILENAME_RE = /run-\d+(-[a-z0-9]+)?\.json$/;

type RunFile = {
  name: string;
  path: string;
  downloadUrl: string;
};

type RunEntry = Record<string, unknown> & {
  name: string;
  path: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function getStringProp(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === "string" ? v : undefined;
}

function extractRunNumber(name: string): number {
  const n = Number.parseInt(name.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
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

  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 20)));
    const skipIndex = searchParams.get("skipIndex") === "true";
    
    if (!path) {
      return new Response(JSON.stringify({ error: "path is required" }), { status: 400 });
    }

    // Encode path: replace / with __ (dots are allowed in filenames)
    const runDir = `qa-runs/${path.replace(/\//g, "__")}`;
    const latestIndexPath = `${runDir}/latest.json`;

    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/vnd.github+json",
    };

    const tokenKey = createHash("sha256")
      .update(session.accessToken)
      .digest("hex")
      .slice(0, 16);
    const cacheKey = `${tokenKey}::${owner}/${name}::${path}::${limit}::${skipIndex ? "1" : "0"}`;
    const cached = testcaseRunsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < TESTCASE_RUNS_CACHE_TTL_MS) {
      return new Response(cached.body, { status: 200, headers: { "X-Cache": "HIT" } });
    }

    // Try to fetch latest.json index first (fast path)
    let latestFromIndex: Record<string, unknown> | null = null;
    if (!skipIndex) {
      try {
        const indexRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(latestIndexPath)}`,
          { headers, cache: "no-store" }
        );
        if (indexRes.ok) {
          const indexData = (await indexRes.json()) as unknown;
          const indexRec = asRecord(indexData);
          const content = indexRec ? getStringProp(indexRec, "content") : undefined;
          if (content) {
            try {
              const indexContent = Buffer.from(content, "base64").toString("utf-8");
              const parsed = JSON.parse(indexContent) as unknown;
              const parsedRec = asRecord(parsed);
              if (parsedRec) {
                latestFromIndex = parsedRec;
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        // Index not found or invalid, fall back to scanning
      }
    }

    if (limit === 1 && latestFromIndex) {
      const body = JSON.stringify({
        latest: latestFromIndex,
        runs: [],
        indexUsed: true,
        indexAvailable: true,
      });
      testcaseRunsCache.set(cacheKey, { ts: Date.now(), body });
      return new Response(body, { status: 200, headers: { "X-Cache": "MISS" } });
    }

    const listRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(runDir)}`,
      { headers, cache: "no-store" }
    );

    if (listRes.status === 404) {
      const body = JSON.stringify({ latest: null, runs: [], indexUsed: false, indexAvailable: false });
      testcaseRunsCache.set(cacheKey, { ts: Date.now(), body });
      return new Response(body, { status: 200, headers: { "X-Cache": "MISS" } });
    }

    if (!listRes.ok) {
      const text = await listRes.text();
      return new Response(text, { status: listRes.status });
    }

    const listJson = (await listRes.json()) as unknown;
    const listArr = Array.isArray(listJson) ? listJson : [];

    const files: RunFile[] = [];
    for (const item of listArr) {
      const rec = asRecord(item);
      if (!rec) continue;
      if (getStringProp(rec, "type") !== "file") continue;

      const fileName = getStringProp(rec, "name");
      const filePath = getStringProp(rec, "path");
      const downloadUrl = getStringProp(rec, "download_url");
      if (!fileName || !filePath || !downloadUrl) continue;
      if (!RUN_FILENAME_RE.test(fileName)) continue;
      files.push({ name: fileName, path: filePath, downloadUrl });
    }

    files.sort((a, b) => extractRunNumber(b.name) - extractRunNumber(a.name));
    const selectedFiles = files.slice(0, limit);

    const runEntries = await Promise.all(
      selectedFiles.map(async (f) => {
        try {
          const r = await fetch(f.downloadUrl, { cache: "no-store" });
          if (!r.ok) return null;
          const json = (await r.json()) as unknown;
          const rec = asRecord(json);
          if (!rec) return null;
          return { name: f.name, path: f.path, ...rec };
        } catch {
          return null;
        }
      })
    );

    const runs = runEntries.filter((r): r is RunEntry => !!r);

    // Use index if available and valid, otherwise use scanned latest
    const latest = latestFromIndex || runs[0] || null;

    const body = JSON.stringify({
      latest,
      runs,
      indexUsed: !!latestFromIndex,
      indexAvailable: !!latestFromIndex,
    });
    testcaseRunsCache.set(cacheKey, { ts: Date.now(), body });
    return new Response(body, { status: 200, headers: { "X-Cache": "MISS" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to list test runs";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
