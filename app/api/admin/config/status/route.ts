import { NextRequest, NextResponse } from "next/server";

interface ConfigCheck {
  key: string;
  required: boolean;
  configured: boolean;
  value?: string;
  error?: string;
  description: string;
}

export async function GET(req: NextRequest) {
  const configs: ConfigCheck[] = [];

  // Check NEXTAUTH_URL
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  configs.push({
    key: "NEXTAUTH_URL",
    required: true,
    configured: !!nextAuthUrl,
    value: nextAuthUrl ? maskUrl(nextAuthUrl) : undefined,
    error: !nextAuthUrl ? "NEXTAUTH_URL is not set" : undefined,
    description: "The URL where your GTMD application is hosted (e.g., http://localhost:3000)",
  });

  // Check NEXTAUTH_SECRET
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  configs.push({
    key: "NEXTAUTH_SECRET",
    required: true,
    configured: !!nextAuthSecret && nextAuthSecret.length >= 32,
    value: nextAuthSecret ? `${nextAuthSecret.substring(0, 8)}...` : undefined,
    error: !nextAuthSecret
      ? "NEXTAUTH_SECRET is not set"
      : nextAuthSecret.length < 32
      ? "NEXTAUTH_SECRET is too short (minimum 32 characters)"
      : undefined,
    description: "Random secret for session encryption (generate with: openssl rand -base64 32)",
  });

  // Check GITHUB_ID
  const githubId = process.env.GITHUB_ID;
  configs.push({
    key: "GITHUB_ID",
    required: true,
    configured: !!githubId,
    value: githubId ? maskSecret(githubId, 6) : undefined,
    error: !githubId ? "GITHUB_ID is not set" : undefined,
    description: "GitHub OAuth App Client ID from GitHub Developer Settings",
  });

  // Check GITHUB_SECRET
  const githubSecret = process.env.GITHUB_SECRET;
  configs.push({
    key: "GITHUB_SECRET",
    required: true,
    configured: !!githubSecret,
    value: githubSecret ? maskSecret(githubSecret, 6) : undefined,
    error: !githubSecret ? "GITHUB_SECRET is not set" : undefined,
    description: "GitHub OAuth App Client Secret from GitHub Developer Settings",
  });

  // Check STORIES_REPO
  const storiesRepo = process.env.STORIES_REPO;
  const storiesRepoValid = storiesRepo && /^[\w-]+\/[\w-]+$/.test(storiesRepo);
  configs.push({
    key: "STORIES_REPO",
    required: true,
    configured: !!storiesRepoValid,
    value: storiesRepo,
    error: !storiesRepo
      ? "STORIES_REPO is not set"
      : !storiesRepoValid
      ? "STORIES_REPO must be in format: owner/repository-name"
      : undefined,
    description: "GitHub repository for Stories and Defects (format: owner/repo-name)",
  });

  // Check TESTCASES_REPO
  const testcasesRepo = process.env.TESTCASES_REPO;
  const testcasesRepoValid = testcasesRepo && /^[\w-]+\/[\w-]+$/.test(testcasesRepo);
  configs.push({
    key: "TESTCASES_REPO",
    required: true,
    configured: !!testcasesRepoValid,
    value: testcasesRepo,
    error: !testcasesRepo
      ? "TESTCASES_REPO is not set"
      : !testcasesRepoValid
      ? "TESTCASES_REPO must be in format: owner/repository-name"
      : undefined,
    description: "GitHub repository for Test Cases (format: owner/repo-name)",
  });

  // Test GitHub repo accessibility (if configured)
  if (storiesRepoValid) {
    try {
      const [owner, name] = storiesRepo!.split("/");
      const response = await fetch(`https://api.github.com/repos/${owner}/${name}`);
      if (!response.ok) {
        const config = configs.find((c) => c.key === "STORIES_REPO");
        if (config) {
          config.configured = false;
          config.error = `Cannot access repository: ${response.status} ${response.statusText}. Check repository exists and OAuth app has access.`;
        }
      }
    } catch (err: any) {
      const config = configs.find((c) => c.key === "STORIES_REPO");
      if (config) {
        config.configured = false;
        config.error = `Failed to verify repository: ${err.message}`;
      }
    }
  }

  if (testcasesRepoValid) {
    try {
      const [owner, name] = testcasesRepo!.split("/");
      const response = await fetch(`https://api.github.com/repos/${owner}/${name}`);
      if (!response.ok) {
        const config = configs.find((c) => c.key === "TESTCASES_REPO");
        if (config) {
          config.configured = false;
          config.error = `Cannot access repository: ${response.status} ${response.statusText}. Check repository exists and OAuth app has access.`;
        }
      }
    } catch (err: any) {
      const config = configs.find((c) => c.key === "TESTCASES_REPO");
      if (config) {
        config.configured = false;
        config.error = `Failed to verify repository: ${err.message}`;
      }
    }
  }

  // Check if all required configs are valid
  const allValid = configs
    .filter((c) => c.required)
    .every((c) => c.configured);

  return NextResponse.json({
    allValid,
    config: configs,
  });
}

// Helper to mask sensitive values
function maskSecret(value: string, showChars: number = 4): string {
  if (value.length <= showChars) return "***";
  return `${value.substring(0, showChars)}${"*".repeat(Math.min(value.length - showChars, 20))}`;
}

// Helper to mask URLs (show domain only)
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}
