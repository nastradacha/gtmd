import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

function ymd(date?: string) {
  if (date) return date;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseRepo(env?: string) {
  if (!env) return null as any;
  if (env.includes("github.com")) {
    const u = new URL(env);
    const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
    return { owner: parts[parts.length - 2], name: parts[parts.length - 1] };
  }
  const [owner, name] = env.split("/");
  return { owner, name };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }
  const repoEnv = process.env.TESTCASES_REPO;
  const repo = parseRepo(repoEnv);
  if (!repo?.owner || !repo?.name) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const date = ymd(searchParams.get("date") || undefined);
  const path = `team/chat/${date}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      });

    if (res.status === 404) {
      return new Response(JSON.stringify({ date, messages: [] }), { status: 200 });
    }
    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status });
    }
    const list = await res.json();
    const messages: any[] = [];
    for (const f of Array.isArray(list) ? list : []) {
      if (f.type === "file" && f.name.endsWith(".json")) {
        const r = await fetch(f.download_url, { cache: "no-store" });
        if (r.ok) messages.push(await r.json());
      }
    }
    messages.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    return new Response(JSON.stringify({ date, messages }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Failed to load chat" }), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }
  const repoEnv = process.env.TESTCASES_REPO;
  const repo = parseRepo(repoEnv);
  if (!repo?.owner || !repo?.name) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  try {
    const body = await req.json();
    const date = ymd(body.date);
    const text = String(body.text || "").trim();
    if (!text) return new Response(JSON.stringify({ error: "text is required" }), { status: 400 });

    const meRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/vnd.github+json" },
    });
    const me = await meRes.json();
    const login = me?.login || "unknown";

    const now = new Date();
    const ts = now.toISOString();
    const entry = {
      date,
      user: login,
      text,
      created_at: ts,
    };

    const filePath = `team/chat/${date}/${now.getTime()}-${login}.json`;

    const putRes = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Chat by ${login} on ${date}`,
          content: Buffer.from(JSON.stringify(entry, null, 2)).toString("base64"),
        }),
      }
    );

    if (!putRes.ok) {
      const text = await putRes.text();
      return new Response(text, { status: putRes.status });
    }

    return new Response(JSON.stringify({ success: true, entry }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Failed to post chat" }), { status: 500 });
  }
}
