// lib/github.ts - GitHub API helper functions

import { GitHubIssue, TestCase, GitHubUser, GitHubRateLimit } from "./types";

const GITHUB_API = "https://api.github.com";

/**
 * Fetch GitHub Issues from a repository
 */
export async function fetchIssues(
  token: string,
  repo: string,
  params?: {
    state?: "open" | "closed" | "all";
    labels?: string;
    milestone?: string;
    assignee?: string;
  }
): Promise<GitHubIssue[]> {
  const [owner, name] = repo.split("/");
  const searchParams = new URLSearchParams({
    state: params?.state || "all",
    per_page: "100",
  });

  if (params?.labels) searchParams.append("labels", params.labels);
  if (params?.milestone) searchParams.append("milestone", params.milestone);
  if (params?.assignee) searchParams.append("assignee", params.assignee);

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/issues?${searchParams}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Create a GitHub Issue
 */
export async function createIssue(
  token: string,
  repo: string,
  data: {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  }
): Promise<GitHubIssue> {
  const [owner, name] = repo.split("/");

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Failed to create issue: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch test case files from a repository
 */
export async function fetchTestCases(
  token: string,
  repo: string,
  path: string = "qa-testcases/manual"
): Promise<TestCase[]> {
  const [owner, name] = repo.split("/");

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch test cases: ${res.status}`);
  }

  const data = await res.json();
  return data
    .filter((item: any) => item.type === "file" && item.name.endsWith(".md"))
    .map((item: any) => ({
      path: item.path,
      name: item.name,
      url: item.html_url,
      sha: item.sha,
    }));
}

/**
 * Fetch a single file's content from GitHub
 */
export async function fetchFileContent(
  token: string,
  repo: string,
  path: string
): Promise<{ content: string; sha: string }> {
  const [owner, name] = repo.split("/");

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch file: ${res.status}`);
  }

  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");

  return { content, sha: data.sha };
}

/**
 * Create a new branch
 */
export async function createBranch(
  token: string,
  repo: string,
  branchName: string,
  fromBranch: string = "main"
): Promise<void> {
  const [owner, name] = repo.split("/");

  // Get the SHA of the base branch
  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/git/ref/heads/${fromBranch}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!refRes.ok) {
    throw new Error(`Failed to get base branch: ${refRes.status}`);
  }

  const refData = await refRes.json();
  const sha = refData.object.sha;

  // Create new branch
  const createRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/git/refs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha,
      }),
    }
  );

  if (!createRes.ok) {
    throw new Error(`Failed to create branch: ${createRes.status}`);
  }
}

/**
 * Create or update a file in a repository
 */
export async function createOrUpdateFile(
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<void> {
  const [owner, name] = repo.split("/");

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
        ...(sha && { sha }),
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to create/update file: ${res.status}`);
  }
}

/**
 * Create a Pull Request
 */
export async function createPullRequest(
  token: string,
  repo: string,
  data: {
    title: string;
    body: string;
    head: string;
    base: string;
  }
): Promise<any> {
  const [owner, name] = repo.split("/");

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Failed to create PR: ${res.status}`);
  }

  return res.json();
}

/**
 * Get authenticated user info
 */
export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user: ${res.status}`);
  }

  return res.json();
}

/**
 * Get rate limit info
 */
export async function getRateLimit(token: string): Promise<GitHubRateLimit> {
  const res = await fetch(`${GITHUB_API}/rate_limit`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch rate limit: ${res.status}`);
  }

  const data = await res.json();
  return data.rate;
}

/**
 * Parse test case frontmatter to extract metadata
 */
export function parseTestCaseFrontmatter(content: string): {
  storyId?: string;
  priority?: string;
  suite?: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) return {};

  const frontmatter = match[1];
  const storyIdMatch = frontmatter.match(/story[_-]?id:\s*(.+)/i);
  const priorityMatch = frontmatter.match(/priority:\s*(.+)/i);
  const suiteMatch = frontmatter.match(/suite:\s*(.+)/i);

  return {
    storyId: storyIdMatch?.[1].trim(),
    priority: priorityMatch?.[1].trim(),
    suite: suiteMatch?.[1].trim(),
  };
}
