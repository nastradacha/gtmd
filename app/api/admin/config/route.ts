import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const repoEnv = process.env.STORIES_REPO || "";

  let storiesRepo = ""; // owner/name
  let storiesRepoUrl = ""; // https://github.com/owner/name

  try {
    if (repoEnv) {
      if (repoEnv.includes("github.com")) {
        try {
          const u = new URL(repoEnv);
          const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
          const owner = parts[parts.length - 2];
          const name = parts[parts.length - 1];
          if (owner && name) {
            storiesRepo = `${owner}/${name}`;
            storiesRepoUrl = `https://github.com/${owner}/${name}`;
          }
        } catch {
          // fall through to generic handling
        }
      }

      if (!storiesRepo) {
        const trimmed = repoEnv.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
        const parts = trimmed.split("/");
        if (parts.length >= 2) {
          const owner = parts[0];
          const name = parts[1];
          storiesRepo = `${owner}/${name}`;
          storiesRepoUrl = `https://github.com/${owner}/${name}`;
        }
      }
    }
  } catch {
    // noop, will return empty values
  }

  return NextResponse.json({ storiesRepo, storiesRepoUrl });
}
