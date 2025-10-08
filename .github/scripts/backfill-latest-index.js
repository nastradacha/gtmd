#!/usr/bin/env node

/**
 * Backfill latest.json index files for existing test runs
 * Usage: node backfill-latest-index.js <GITHUB_TOKEN> <OWNER> <REPO>
 */

const https = require('https');

const [,, token, owner, repo] = process.argv;

if (!token || !owner || !repo) {
  console.error('Usage: node backfill-latest-index.js <GITHUB_TOKEN> <OWNER> <REPO>');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'GTMD-Backfill-Script'
};

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getMainSha() {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`;
  const res = await httpsRequest(url);
  return res.data.object.sha;
}

async function getTree(sha) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
  const res = await httpsRequest(url);
  return res.data.tree || [];
}

async function getFileContent(path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await httpsRequest(url);
  return JSON.parse(Buffer.from(res.data.content, 'base64').toString('utf-8'));
}

async function createOrUpdateFile(path, content, message, sha = null) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = JSON.stringify({
    message,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    ...(sha ? { sha } : {})
  });
  
  try {
    await httpsRequest(url, { method: 'PUT', body });
    return true;
  } catch (err) {
    console.error(`  Failed to create ${path}: ${err.message}`);
    return false;
  }
}

async function checkFileExists(path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  try {
    const res = await httpsRequest(url);
    return res.data.sha;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`🔍 Backfilling latest.json index files for ${owner}/${repo}...\n`);
  
  // Get all files in qa-runs/
  const mainSha = await getMainSha();
  const tree = await getTree(mainSha);
  
  const runFiles = tree.filter(entry => 
    entry.type === 'blob' && 
    entry.path.startsWith('qa-runs/') && 
    /run-\d+\.json$/.test(entry.path)
  );
  
  console.log(`Found ${runFiles.length} run files\n`);
  
  // Group by run directory
  const runDirs = new Map();
  for (const file of runFiles) {
    const runDir = file.path.substring(0, file.path.lastIndexOf('/'));
    const match = file.path.match(/run-(\d+)\.json$/);
    const ms = match ? parseInt(match[1], 10) : 0;
    
    if (!runDirs.has(runDir)) {
      runDirs.set(runDir, []);
    }
    runDirs.get(runDir).push({ path: file.path, ms });
  }
  
  console.log(`Processing ${runDirs.size} test directories...\n`);
  
  let created = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const [runDir, runs] of runDirs.entries()) {
    const latestPath = `${runDir}/latest.json`;
    
    // Check if latest.json already exists
    const existingSha = await checkFileExists(latestPath);
    if (existingSha) {
      console.log(`  ⏭️  Skipping ${latestPath} (already exists)`);
      skipped++;
      continue;
    }
    
    // Find latest run
    const latest = runs.reduce((max, r) => r.ms > max.ms ? r : max);
    
    try {
      // Fetch the latest run file content
      const runContent = await getFileContent(latest.path);
      
      // Create latest.json
      const latestContent = {
        result: runContent.result,
        executed_at: runContent.executed_at,
        executed_by: runContent.executed_by,
        run_file: latest.path.split('/').pop(),
        updated_at: new Date().toISOString(),
      };
      
      const success = await createOrUpdateFile(
        latestPath,
        latestContent,
        `Backfill latest.json index for ${runDir}`
      );
      
      if (success) {
        console.log(`  ✅ Created ${latestPath}`);
        created++;
      } else {
        failed++;
      }
      
      // Rate limit: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`  ❌ Error processing ${runDir}: ${err.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Backfill complete!`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`\nTotal: ${created + skipped + failed} directories processed`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
