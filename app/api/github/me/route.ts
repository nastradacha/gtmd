import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHash } from "crypto";

export const runtime = "nodejs";

type MeCacheEntry = {
  ts: number;
  body: string;
};

const meCache: Map<string, MeCacheEntry> = new Map();
const ME_CACHE_TTL_MS = 60_000;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const tokenKey = createHash("sha256").update(session.accessToken).digest("hex").slice(0, 16);
  const cached = meCache.get(tokenKey);
  if (cached && Date.now() - cached.ts < ME_CACHE_TTL_MS) {
    return new Response(cached.body, { status: 200, headers: { "X-Cache": "HIT" } });
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }

    const data = await res.json();
    const body = JSON.stringify(data);
    meCache.set(tokenKey, { ts: Date.now(), body });
    return new Response(body, { status: 200, headers: { "X-Cache": "MISS" } });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to fetch user info" }),
      { status: 500 }
    );
  }
}
