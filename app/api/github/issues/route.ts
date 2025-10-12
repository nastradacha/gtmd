import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = process.env.STORIES_REPO;
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
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
      JSON.stringify({ error: 'Invalid STORIES_REPO format. Use "owner/name" or a full GitHub URL.' }),
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") || "all";
  const labels = searchParams.get("labels") || "";
  const milestone = searchParams.get("milestone") || "";
  const assignee = searchParams.get("assignee") || "";
  const params = new URLSearchParams({ state, per_page: "100" });
  if (labels) params.append("labels", labels);
  if (milestone) params.append("milestone", milestone);
  if (assignee) params.append("assignee", assignee);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues?${params}`,
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
      JSON.stringify({ error: "Failed to fetch issues" }),
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repoEnv = process.env.STORIES_REPO;
  if (!repoEnv) {
    return new Response(JSON.stringify({ error: "STORIES_REPO not configured" }), { status: 500 });
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
      JSON.stringify({ error: 'Invalid STORIES_REPO format. Use "owner/name" or a full GitHub URL.' }),
      { status: 500 }
    );
  }

  try {
    // Support both JSON and multipart/form-data
    const contentType = req.headers.get("content-type") || "";

    let title = "";
    let bodyText = "";
    let labels: string[] = [];
    let screenshots: File[] = [] as any;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      title = (form.get("title") as string) || "";
      bodyText = (form.get("body") as string) || "";
      const labelsRaw = form.get("labels") as string | null;
      if (labelsRaw) {
        try { labels = JSON.parse(labelsRaw); } catch { labels = []; }
      }
      const files = form.getAll("screenshots");
      screenshots = files.filter((f: any) => typeof File !== "undefined" ? f instanceof File : true) as any;
    } else {
      const json = await req.json();
      title = json.title || "";
      bodyText = json.body || "";
      labels = Array.isArray(json.labels) ? json.labels : [];
    }

    if (!title || !bodyText) {
      return new Response(JSON.stringify({ error: "title and body are required" }), { status: 400 });
    }

    // 1) Create the issue first
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body: bodyText, labels }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      return new Response(text, { status: createRes.status });
    }
    const issue = await createRes.json();

    // 2) If screenshots provided, upload each to the repo and append to body
    if (Array.isArray(screenshots) && screenshots.length > 0) {
      const uploadUrls: string[] = [];

      for (const file of screenshots) {
        try {
          // Convert File/Blob -> base64
          const arrBuf = await (file as Blob).arrayBuffer();
          const buf = Buffer.from(arrBuf);

          const safeName = (file as any).name
            ?.toString()
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, "-") || `screenshot-${Date.now()}.png`;
          const ts = Date.now();
          const attachmentPath = `qa-attachments/defects/${issue.number}/${ts}-${safeName}`;

          const putRes = await fetch(
            `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(attachmentPath)}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${session.accessToken}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: `Attach screenshot to issue #${issue.number}`,
                content: buf.toString("base64"),
                branch: "main",
              }),
            }
          );

          if (putRes.ok) {
            const putJson = await putRes.json();
            const dl = putJson?.content?.download_url || `https://raw.githubusercontent.com/${owner}/${name}/main/${attachmentPath}`;
            uploadUrls.push(dl);
          }
        } catch {
          // Skip failed uploads, continue with others
        }
      }

      if (uploadUrls.length > 0) {
        const attachmentsMd = `\n\n## Attachments\n` + uploadUrls.map((u, idx) => `![screenshot-${idx + 1}](${u})`).join("\n");
        const updatedBody = (issue.body || bodyText || "") + attachmentsMd;
        // PATCH issue body with attachments section
        await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${issue.number}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body: updatedBody }),
        });
        issue.body = updatedBody;
      }
    }

    return new Response(JSON.stringify(issue), { status: 201 });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to create issue" }),
      { status: 500 }
    );
  }
}
