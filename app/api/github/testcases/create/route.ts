import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repo = process.env.TESTCASES_REPO;
  if (!repo) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  try {
    const body = await req.json();
    const { title, storyId, steps, expected, priority, suite, folder } = body;

    if (!title || !steps || !expected) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // Parse repo URL if needed
    let owner: string, name: string;
    if (repo.includes("github.com")) {
      const u = new URL(repo);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      owner = parts[parts.length - 2];
      name = parts[parts.length - 1];
    } else {
      [owner, name] = repo.split("/");
    }

    // Get current user for auditing
    const meRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const meData = await meRes.json();
    const login = meData.login || "unknown";
    const quote = (v: any) => JSON.stringify(String(v));

    // Generate filename from title
    const timestamp = Date.now();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filename = `TC-${timestamp}-${slug}.md`;
    const branchName = `testcase/${slug}-${timestamp}`;

    // Create markdown content with audit metadata
    const content = `---
title: ${quote(title)}
story_id: ${quote(storyId || "N/A")}
priority: ${quote(priority || "P2")}
suite: ${quote(suite || "General")}
created: ${quote(new Date().toISOString())}
created_by: ${quote(login)}
---

# ${title}

## Story Reference
${storyId ? `Story #${storyId}` : "No story linked"}

## Test Steps
${steps}

## Expected Results
${expected}

## Priority
${priority || "P2"}

## Test Suite
${suite || "General"}
`;

    // Get default branch SHA
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/ref/heads/main`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
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
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/refs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha,
        }),
      }
    );

    if (!branchRes.ok) {
      throw new Error(`Failed to create branch: ${branchRes.status}`);
    }

    // Resolve folder path under qa-testcases
    function sanitizeFolder(input?: string): string {
      if (!input) return "manual/General";
      let f = String(input).trim().replace(/\\/g, "/");
      f = f.replace(/^\/+|\/+$/g, "");
      // Only allow under manual/ or Regression/
      if (!/^manual\//i.test(f) && !/^Regression(\/.+)?$/i.test(f)) {
        f = `manual/${f}`;
      }
      return f;
    }
    const folderPath = sanitizeFolder(folder);

    // Create file in new branch
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/qa-testcases/${folderPath}/${filename}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Add test case: ${title} (by ${login})`,
          content: Buffer.from(content).toString("base64"),
          branch: branchName,
        }),
      }
    );

    if (!fileRes.ok) {
      throw new Error(`Failed to create file: ${fileRes.status}`);
    }

    // Create Pull Request
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `New Test Case: ${title}`,
        body: `## Test Case Details\n\n- **Story ID**: ${storyId || "N/A"}\n- **Priority**: ${priority || "P2"}\n- **Suite**: ${suite || "General"}\n- **Folder**: ${folderPath}\n\n## Description\nThis PR adds a new test case for review.\n\n### Steps\n${steps}\n\n### Expected Results\n${expected}`,
        head: branchName,
        base: "main",
      }),
    });

    if (!prRes.ok) {
      throw new Error(`Failed to create PR: ${prRes.status}`);
    }

    const prData = await prRes.json();
    return new Response(
      JSON.stringify({
        success: true,
        pr: {
          number: prData.number,
          url: prData.html_url,
          branch: branchName,
        },
      }),
      { status: 201 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create test case" }),
      { status: 500 }
    );
  }
}
