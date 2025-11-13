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
    const quote = (v: any) => JSON.stringify(String(v));

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
    } catch (err) {
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
            branch: "main", // Update in main, not feature branch!
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
