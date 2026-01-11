import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getRepoEnv } from "@/lib/projects";

/**
 * GET/POST /api/admin/fix-duplicate-ids
 * Scans all test cases, finds duplicates, and renames them to unique sequential IDs
 * Query params:
 *  - dryRun=true : preview changes without applying them
 */
async function fixDuplicates(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "true";

  const repo = getRepoEnv(req, "testcases");
  if (!repo) {
    return new Response(JSON.stringify({ error: "TESTCASES_REPO not configured" }), { status: 500 });
  }

  try {
    // Parse repo
    let owner: string, name: string;
    if (repo.includes("github.com")) {
      const u = new URL(repo);
      const parts = u.pathname.replace(/^\/+|\.git$/g, "").split("/");
      owner = parts[parts.length - 2];
      name = parts[parts.length - 1];
    } else {
      [owner, name] = repo.split("/");
    }

    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/vnd.github+json",
    };

    // Get all test case files
    const listRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/qa-testcases`,
      { headers, cache: "no-store" }
    );

    if (!listRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch test cases" }), { status: listRes.status });
    }

    // Recursively get all .md files
    async function getAllFiles(path: string): Promise<any[]> {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${path}`,
        { headers, cache: "no-store" }
      );
      if (!res.ok) return [];
      const data = await res.json();
      
      let files: any[] = [];
      for (const item of data) {
        if (item.type === "file" && item.name.endsWith(".md")) {
          files.push(item);
        } else if (item.type === "dir") {
          const subFiles = await getAllFiles(item.path);
          files = files.concat(subFiles);
        }
      }
      return files;
    }

    const allFiles = await getAllFiles("qa-testcases");

    // Extract TC IDs and find duplicates
    const tcPattern = /^TC-(\d{3,})/;
    const idMap: Map<string, any[]> = new Map();

    for (const file of allFiles) {
      const match = file.name.match(tcPattern);
      if (match) {
        const tcId = match[1]; // e.g., "004", "005"
        if (!idMap.has(tcId)) {
          idMap.set(tcId, []);
        }
        idMap.get(tcId)!.push(file);
      }
    }

    // Find duplicates
    const duplicates: { id: string; files: any[] }[] = [];
    for (const [id, files] of idMap.entries()) {
      if (files.length > 1) {
        duplicates.push({ id, files });
      }
    }

    if (duplicates.length === 0) {
      return new Response(
        JSON.stringify({ message: "No duplicates found!", duplicates: [] }),
        { status: 200 }
      );
    }

    // Get current counter to find next available IDs
    const counterPath = ".gtmd/testcase-counter.txt";
    let nextAvailableId = 1;
    try {
      const counterRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${counterPath}`,
        { headers }
      );
      if (counterRes.ok) {
        const counterData = await counterRes.json();
        const counterContent = Buffer.from(counterData.content, "base64").toString("utf-8");
        nextAvailableId = parseInt(counterContent.trim(), 10) + 1;
      }
    } catch (e) {
      // Use max ID from files + 1
      const maxId = Math.max(...Array.from(idMap.keys()).map(id => parseInt(id, 10)));
      nextAvailableId = maxId + 1;
    }

    // Plan renames
    const renamePlan: { oldPath: string; newPath: string; oldName: string; newName: string; newId: string }[] = [];
    
    for (const dup of duplicates) {
      // Keep the first file, rename the rest
      const filesToRename = dup.files.slice(1);
      
      for (const file of filesToRename) {
        const newId = String(nextAvailableId).padStart(3, "0");
        const oldName = file.name;
        const newName = oldName.replace(/^TC-\d{3,}/, `TC-${newId}`);
        const newPath = file.path.replace(oldName, newName);
        
        renamePlan.push({
          oldPath: file.path,
          newPath,
          oldName,
          newName,
          newId,
        });
        
        nextAvailableId++;
      }
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          message: "DRY RUN - No changes made",
          duplicatesFound: duplicates.length,
          totalFilesToRename: renamePlan.length,
          plan: renamePlan,
          nextCounterValue: nextAvailableId,
        }),
        { status: 200 }
      );
    }

    // Execute renames
    const results: any[] = [];
    
    for (const rename of renamePlan) {
      try {
        // Get file content and SHA
        const fileRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(rename.oldPath)}`,
          { headers }
        );
        
        if (!fileRes.ok) {
          results.push({ ...rename, status: "error", error: "File not found" });
          continue;
        }

        const fileData = await fileRes.json();
        const content = Buffer.from(fileData.content, "base64").toString("utf-8");
        
        // Update content if it contains the old ID in frontmatter
        const updatedContent = content.replace(
          /^(---[\s\S]*?)title:\s*"?([^"\n]*TC-\d{3,}[^"\n]*)"?/m,
          (match, before, title) => {
            const newTitle = title.replace(/TC-\d{3,}/, `TC-${rename.newId}`);
            return `${before}title: "${newTitle}"`;
          }
        );

        // Create new file
        const createRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(rename.newPath)}`,
          {
            method: "PUT",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `Rename ${rename.oldName} to ${rename.newName} (fix duplicate ID)`,
              content: Buffer.from(updatedContent).toString("base64"),
            }),
          }
        );

        if (!createRes.ok) {
          results.push({ ...rename, status: "error", error: `Failed to create new file: ${createRes.status}` });
          continue;
        }

        // Delete old file
        const deleteRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(rename.oldPath)}`,
          {
            method: "DELETE",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `Remove duplicate ${rename.oldName} (renamed to ${rename.newName})`,
              sha: fileData.sha,
            }),
          }
        );

        if (!deleteRes.ok) {
          results.push({ ...rename, status: "partial", error: "Created new file but failed to delete old" });
          continue;
        }

        results.push({ ...rename, status: "success" });
      } catch (error: any) {
        results.push({ ...rename, status: "error", error: error.message });
      }
    }

    // Update counter
    try {
      const counterRes = await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${counterPath}`,
        { headers }
      );

      let counterSha: string | undefined;
      if (counterRes.ok) {
        const counterData = await counterRes.json();
        counterSha = counterData.sha;
      }

      await fetch(
        `https://api.github.com/repos/${owner}/${name}/contents/${counterPath}`,
        {
          method: "PUT",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Update counter after fixing duplicates to ${nextAvailableId - 1}`,
            content: Buffer.from(String(nextAvailableId - 1)).toString("base64"),
            ...(counterSha ? { sha: counterSha } : {}),
          }),
        }
      );
    } catch (e) {
      console.error("Failed to update counter:", e);
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

    return new Response(
      JSON.stringify({
        message: `Fixed ${successCount} duplicates, ${errorCount} errors`,
        duplicatesFound: duplicates.length,
        results,
        newCounterValue: nextAvailableId - 1,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fix duplicates" }),
      { status: 500 }
    );
  }
}

// Export both GET and POST handlers
export async function GET(req: NextRequest) {
  return fixDuplicates(req);
}

export async function POST(req: NextRequest) {
  return fixDuplicates(req);
}
