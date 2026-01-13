import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv } from "@/lib/projects";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const repo = getRepoEnv(req, "testcases");
  if (!repo) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  try {
    const body = await req.json();
    const { title, story_id, steps, expected, priority, suite, folder, component, preconditions, data, env,
      setup_sql, verification_sql, teardown_sql, setup_sql_file, verification_sql_file, teardown_sql_file } = body;

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
    const quote = (v: unknown) => JSON.stringify(String(v));

    // Get next test case ID from counter file
    let nextId = 1;
    const counterPath = ".gtmd/testcase-counter.txt";
    
    try {
      const counterRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${counterPath}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );
      
      if (counterRes.ok) {
        const counterData = await counterRes.json();
        const counterContent = Buffer.from(counterData.content, "base64").toString("utf-8");
        nextId = parseInt(counterContent.trim(), 10) + 1;
      }
    } catch {
      // Counter file doesn't exist yet, start at 1
      console.log("Counter file not found, starting at TC-001");
    }

    // Generate filename with sequential ID
    const tcId = String(nextId).padStart(3, "0"); // TC-001, TC-002, etc.
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50); // Limit slug length
    const filename = `TC-${tcId}-${slug}.md`;
    const branchName = `testcase/tc-${tcId}-${slug}`;

    async function readGitHubError(res: Response): Promise<string> {
      try {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text) as unknown;
          const msg =
            parsed && typeof parsed === "object" && "message" in parsed
              ? (parsed as { message?: unknown }).message
              : undefined;
          return typeof msg === "string" && msg.trim() ? msg.trim() : (text || res.statusText);
        } catch {
          return text || res.statusText;
        }
      } catch {
        return res.statusText;
      }
    }

    // Determine base branch (default branch may be master/main/etc.)
    let baseBranch = "main";
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      });
      if (repoRes.ok) {
        const repoJson = (await repoRes.json()) as unknown;
        const defaultBranch =
          repoJson && typeof repoJson === "object" && "default_branch" in repoJson
            ? (repoJson as { default_branch?: unknown }).default_branch
            : undefined;
        if (typeof defaultBranch === "string" && defaultBranch.trim()) {
          baseBranch = defaultBranch.trim();
        }
      }
    } catch {
      // ignore
    }

    // Helper to format YAML values safely (handles special chars and multi-line)
    const formatYamlValue = (value: string) => {
      if (!value) return quote(value);
      
      // Special YAML characters that need quoting or block literals
      const hasSpecialChars = /[:\[\]{}#@&*!|>'"%]/.test(value);
      const hasNewlines = value.includes('\n');
      
      // Use block literal for multi-line content (allows any characters)
      if (hasNewlines) {
        const lines = value.split('\n').map(line => `  ${line}`).join('\n');
        return `|\n${lines}`;
      }
      
      // Use quoted string for single-line with special chars
      if (hasSpecialChars) {
        return quote(value);
      }
      
      // Safe to use unquoted
      return quote(value);
    };

    // Create markdown content with audit metadata
    const content = `---
title: ${quote(title)}
story_id: ${quote(story_id || "")}
priority: ${quote(priority || "P2")}
suite: ${quote(suite || "General")}
${component ? `component: ${quote(component)}\n` : ""}${preconditions ? `preconditions: ${formatYamlValue(preconditions)}\n` : ""}${data ? `data: ${formatYamlValue(data)}\n` : ""}${setup_sql ? `setup_sql: ${formatYamlValue(setup_sql)}\n` : ""}${verification_sql ? `verification_sql: ${formatYamlValue(verification_sql)}\n` : ""}${teardown_sql ? `teardown_sql: ${formatYamlValue(teardown_sql)}\n` : ""}${setup_sql_file ? `setup_sql_file: ${quote(setup_sql_file)}\n` : ""}${verification_sql_file ? `verification_sql_file: ${quote(verification_sql_file)}\n` : ""}${teardown_sql_file ? `teardown_sql_file: ${quote(teardown_sql_file)}\n` : ""}steps: ${formatYamlValue(steps)}
expected: ${formatYamlValue(expected)}
${env ? `env: ${quote(env)}\n` : ""}status: "Draft"
created: ${quote(new Date().toISOString())}
created_by: ${quote(login)}
---

# ${title}

## Story Reference
${story_id ? `Story #${story_id}` : "No story linked"}

${preconditions ? `## Preconditions\n${preconditions}\n` : ""}

${data ? `## Test Data\n${data}\n` : ""}

## Test Steps
${steps}

## Expected Results
${expected}

## Metadata
- **Priority**: ${priority || "P2"}
- **Suite**: ${suite || "General"}
${component ? `- **Component**: ${component}` : ""}
${env ? `- **Environment**: ${env}` : ""}
`;

    // Get base branch SHA (fallback main/master)
    const baseCandidates = Array.from(new Set([baseBranch, "main", "master"]));
    let sha: string | null = null;
    let baseRefStatus: number | null = null;

    for (const candidate of baseCandidates) {
      const refRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(candidate)}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        }
      );

      if (refRes.ok) {
        const refData = (await refRes.json()) as unknown;
        const nextSha =
          refData && typeof refData === "object" && "object" in refData
            ? (refData as { object?: unknown }).object
            : undefined;
        const shaValue =
          nextSha && typeof nextSha === "object" && "sha" in (nextSha as object)
            ? (nextSha as { sha?: unknown }).sha
            : undefined;

        if (typeof shaValue === "string" && shaValue.trim()) {
          sha = shaValue;
          baseBranch = candidate;
          break;
        }
      }

      baseRefStatus = refRes.status;
    }

    if (!sha) {
      throw new Error(`Failed to get base branch: ${baseRefStatus || 500}`);
    }

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
      const ghMsg = await readGitHubError(branchRes);
      const hint =
        branchRes.status === 404 || branchRes.status === 403
          ? ` You may not have write access to ${owner}/${name}, or the GTMD OAuth app isn't authorized for this org.`
          : "";
      throw new Error(`Failed to create branch: ${branchRes.status}${ghMsg ? ` (${ghMsg})` : ""}.${hint}`);
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

    // Update counter file with new ID in main branch (not feature branch!)
    try {
      const counterRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${counterPath}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      let counterSha: string | undefined;
      if (counterRes.ok) {
        const counterData = await counterRes.json();
        counterSha = counterData.sha;
      }

      // Update or create counter file in MAIN branch
      const updateRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${counterPath}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Update test case counter to ${nextId}`,
            content: Buffer.from(String(nextId)).toString("base64"),
            branch: baseBranch, // Update counter in default branch
            ...(counterSha ? { sha: counterSha } : {}),
          }),
        }
      );
      
      if (!updateRes.ok) {
        console.error("Failed to update counter in main:", await updateRes.text());
      }
    } catch (err) {
      console.error("Failed to update counter:", err);
      // Don't fail the whole operation if counter update fails
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
        body: `## Test Case Details\n\n- **Story ID**: ${story_id || "N/A"}\n- **Priority**: ${priority || "P2"}\n- **Suite**: ${suite || "General"}\n${component ? `- **Component**: ${component}\n` : ""}- **Folder**: ${folderPath}\n\n## Description\nThis PR adds a new test case for review.\n\n### Steps\n${steps}\n\n### Expected Results\n${expected}`,
        head: branchName,
        base: baseBranch,
      }),
    });

    if (!prRes.ok) {
      const ghMsg = await readGitHubError(prRes);
      throw new Error(`Failed to create PR: ${prRes.status}${ghMsg ? ` (${ghMsg})` : ""}`);
    }

    const prJson = (await prRes.json()) as unknown;
    const prRec = prJson && typeof prJson === "object" ? (prJson as Record<string, unknown>) : null;
    const prNumber = prRec ? prRec.number : undefined;
    const prUrl = prRec ? prRec.html_url : undefined;
    if (typeof prNumber !== "number" || typeof prUrl !== "string") {
      throw new Error("Failed to create PR: invalid response from GitHub");
    }

    return new Response(
      JSON.stringify({
        success: true,
        pr: {
          number: prNumber,
          url: prUrl,
          branch: branchName,
        },
      }),
      { status: 201 }
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to create test case" }),
      { status: 500 }
    );
  }
}
