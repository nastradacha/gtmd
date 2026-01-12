import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv, resolveActiveProject } from "@/lib/projects";
import { createHash } from "crypto";

export const runtime = "nodejs";

type ProjectIssueStatusCacheEntry = {
  ts: number;
  byNodeId: Record<string, string>;
};

type GraphQLProjectItemsResponse = {
  data?: {
    user?: {
      projectV2?: GraphQLProjectV2 | null;
    } | null;
    organization?: {
      projectV2?: GraphQLProjectV2 | null;
    } | null;
  } | null;
};

type GraphQLProjectV2 = {
  items?: {
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
    nodes?: Array<GraphQLProjectItem | null> | null;
  } | null;
};

type GraphQLProjectItem = {
  content?: {
    id?: string | null;
  } | null;
  fieldValues?: {
    nodes?: Array<GraphQLFieldValue | null> | null;
  } | null;
};

type GraphQLFieldValue = {
  name?: string | null;
  field?: {
    name?: string | null;
  } | null;
};

const projectIssueStatusCache: Map<string, ProjectIssueStatusCacheEntry> = new Map();
const PROJECT_ISSUE_STATUS_CACHE_TTL_MS = 60_000;

type IssuesResponseCacheEntry = {
  ts: number;
  body: string;
};

const issuesResponseCache: Map<string, IssuesResponseCacheEntry> = new Map();
const ISSUES_RESPONSE_CACHE_TTL_MS = 60_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function getStringProp(value: unknown, key: string): string | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  const v = rec[key];
  return typeof v === "string" ? v : undefined;
}

function parseProjectV2Url(projectUrl: string): { login: string; number: number } | null {
  try {
    const u = new URL(projectUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "projects");
    if (idx === -1 || idx + 1 >= parts.length) return null;
    if (idx - 1 < 0) return null;
    const login = parts[idx - 1];
    const number = Number(parts[idx + 1]);
    if (!login || !Number.isFinite(number)) return null;
    return { login, number };
  } catch {
    return null;
  }
}

async function getProjectIssueStatuses(options: {
  accessToken: string;
  projectUrl: string;
  statusFieldName: string;
}): Promise<Record<string, string>> {
  const key = `${options.projectUrl}::${options.statusFieldName}`;
  const cached = projectIssueStatusCache.get(key);
  if (cached && Date.now() - cached.ts < PROJECT_ISSUE_STATUS_CACHE_TTL_MS) {
    return cached.byNodeId;
  }

  const parsed = parseProjectV2Url(options.projectUrl);
  if (!parsed) return {};

  const query = `
    query($login: String!, $number: Int!, $after: String) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              content { ... on Issue { id } }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2SingleSelectField { name } }
                  }
                }
              }
            }
          }
        }
      }
      organization(login: $login) {
        projectV2(number: $number) {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              content { ... on Issue { id } }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2SingleSelectField { name } }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const byNodeId: Record<string, string> = {};
  let after: string | null = null;
  let pages = 0;

  while (pages < 20) {
    const res: Response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          login: parsed.login,
          number: parsed.number,
          after,
        },
      }),
    });

    if (!res.ok) {
      break;
    }

    const json = (await res.json()) as GraphQLProjectItemsResponse;
    const project = json?.data?.user?.projectV2 ?? json?.data?.organization?.projectV2;
    const items = project?.items;
    const nodes = items?.nodes ?? [];

    for (const item of nodes) {
      const issueId = item?.content?.id;
      if (!issueId) continue;

      const fvNodes = Array.isArray(item?.fieldValues?.nodes) ? item.fieldValues.nodes : [];
      for (const fv of fvNodes) {
        const fieldName = fv?.field?.name;
        const valueName = fv?.name;
        if (fieldName === options.statusFieldName && typeof valueName === "string" && valueName.trim()) {
          byNodeId[issueId] = valueName.trim();
          break;
        }
      }
    }

    const pageInfo = items?.pageInfo;
    const hasNextPage = !!pageInfo?.hasNextPage;
    const endCursor = pageInfo?.endCursor ?? null;
    pages += 1;

    if (!hasNextPage || !endCursor) {
      break;
    }

    after = endCursor;
  }

  projectIssueStatusCache.set(key, { ts: Date.now(), byNodeId });
  return byNodeId;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const accessToken = session.accessToken;

  const repoEnv = getRepoEnv(req, "stories");
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
  const includeProjectStatus = /^(1|true)$/i.test(searchParams.get("includeProjectStatus") || "");
  const params = new URLSearchParams({ state, per_page: "100" });
  if (labels) params.append("labels", labels);
  if (milestone) params.append("milestone", milestone);
  if (assignee) params.append("assignee", assignee);

  const { project } = resolveActiveProject(req);
  const projectUrl = project?.storiesProjectUrl;
  const statusFieldName = project?.storiesProjectStatusField || "Status";

  const tokenKey = createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
  const cacheKey = `${tokenKey}::${owner}/${name}::${params.toString()}::${includeProjectStatus ? "1" : "0"}::${projectUrl || ""}::${statusFieldName}`;
  const cached = issuesResponseCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ISSUES_RESPONSE_CACHE_TTL_MS) {
    return new Response(cached.body, { status: 200, headers: { "X-Cache": "HIT" } });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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

    if (
      includeProjectStatus &&
      projectUrl &&
      Array.isArray(data) &&
      data.some((i) => getStringProp(i, "state") === "open")
    ) {
      try {
        const byNodeId = await getProjectIssueStatuses({
          accessToken,
          projectUrl,
          statusFieldName,
        });

        const augmented = data.map((issue) => {
          const rec = asRecord(issue);
          if (!rec) return issue;

          const nodeId = typeof rec.node_id === "string" ? rec.node_id : undefined;
          const status = nodeId ? byNodeId[nodeId] : undefined;
          return status ? { ...rec, gtmd_project_status: status } : rec;
        });

        const body = JSON.stringify(augmented);
        issuesResponseCache.set(cacheKey, { ts: Date.now(), body });
        return new Response(body, { status: 200, headers: { "X-Cache": "MISS" } });
      } catch {
        const body = JSON.stringify(data);
        issuesResponseCache.set(cacheKey, { ts: Date.now(), body });
        return new Response(body, { status: 200, headers: { "X-Cache": "MISS" } });
      }
    }

    const body = JSON.stringify(data);
    issuesResponseCache.set(cacheKey, { ts: Date.now(), body });
    return new Response(body, { status: 200, headers: { "X-Cache": "MISS" } });
  } catch {
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

  const repoEnv = getRepoEnv(req, "stories");
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
    let screenshots: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      title = (form.get("title") as string) || "";
      bodyText = (form.get("body") as string) || "";
      const labelsRaw = form.get("labels") as string | null;
      if (labelsRaw) {
        try { labels = JSON.parse(labelsRaw); } catch { labels = []; }
      }
      const files = form.getAll("screenshots");
      screenshots = files.filter((f): f is File => typeof f !== "string");
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

          const safeName = file.name
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
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to create issue" }),
      { status: 500 }
    );
  }
}
