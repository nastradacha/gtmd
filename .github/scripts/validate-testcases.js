#!/usr/bin/env node

/**
 * Validate test case frontmatter schema
 * Usage: node validate-testcases.js <file1.md> <file2.md> ...
 */

const fs = require('fs');
const path = require('path');

// Schema v2 fields
const REQUIRED_FIELDS = ['title', 'steps', 'expected'];
const OPTIONAL_FIELDS = [
  'story_id',
  'suite',
  'priority',
  'component',
  'preconditions',
  'data',
  'env',
  'app_version',
  'owner',
  'assigned_to',
  'status',
  'created',
  'created_by'
];
const VALID_PRIORITIES = ['P1', 'P2', 'P3'];
const VALID_STATUSES = ['Draft', 'Ready', 'Approved', 'Obsolete'];

let hasErrors = false;
let warningCount = 0;

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
  if (!match) return null;
  
  const block = match[1];
  const meta = {};
  
  block.split(/\r?\n/).forEach(line => {
    const m = line.match(/^(\w[\w_-]*):\s*(?:["'](.+?)["']|(.+?))\s*$/);
    if (m) {
      meta[m[1]] = (m[2] || m[3] || '').trim();
    }
  });
  
  return meta;
}

function validateTestCase(filePath) {
  console.log(`\n📝 Validating: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ ERROR: File not found`);
    hasErrors = true;
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const meta = parseFrontmatter(content);
  
  if (!meta) {
    console.error(`  ❌ ERROR: No frontmatter found`);
    hasErrors = true;
    return;
  }
  
  // Check required fields
  const missing = REQUIRED_FIELDS.filter(f => !meta[f] || meta[f].trim() === '');
  if (missing.length > 0) {
    console.error(`  ❌ ERROR: Missing required fields: ${missing.join(', ')}`);
    hasErrors = true;
  }
  
  // Check for unknown fields
  const allKnown = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
  const unknown = Object.keys(meta).filter(k => !allKnown.includes(k));
  if (unknown.length > 0) {
    console.warn(`  ⚠️  WARNING: Unknown fields: ${unknown.join(', ')}`);
    warningCount++;
  }
  
  // Validate priority
  if (meta.priority && !VALID_PRIORITIES.includes(meta.priority)) {
    console.error(`  ❌ ERROR: Invalid priority "${meta.priority}". Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    hasErrors = true;
  }
  
  // Validate status
  if (meta.status && !VALID_STATUSES.includes(meta.status)) {
    console.error(`  ❌ ERROR: Invalid status "${meta.status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
    hasErrors = true;
  }
  
  // Check if body has steps and expected sections
  const bodyMatch = content.match(/^---\s*\r?\n[\s\S]+?\r?\n---\s*\r?\n([\s\S]*)$/);
  if (bodyMatch) {
    const body = bodyMatch[1];
    
    // Warn if steps/expected are only in frontmatter but not in body
    if (meta.steps && !body.includes('## Test Steps') && !body.includes('## Steps')) {
      console.warn(`  ⚠️  WARNING: Steps are in frontmatter but no "## Test Steps" section in body`);
      warningCount++;
    }
    
    if (meta.expected && !body.includes('## Expected Results') && !body.includes('## Expected')) {
      console.warn(`  ⚠️  WARNING: Expected results are in frontmatter but no "## Expected Results" section in body`);
      warningCount++;
    }
  }
  
  if (!hasErrors) {
    console.log(`  ✅ Valid`);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node validate-testcases.js <file1.md> <file2.md> ...');
  process.exit(1);
}

console.log('🔍 Validating test case frontmatter schema v2...\n');

args.forEach(validateTestCase);

console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.error(`\n❌ VALIDATION FAILED with errors`);
  if (warningCount > 0) {
    console.warn(`⚠️  ${warningCount} warning(s) found`);
  }
  process.exit(1);
} else {
  console.log(`\n✅ All test cases valid!`);
  if (warningCount > 0) {
    console.warn(`⚠️  ${warningCount} warning(s) found (non-blocking)`);
  }
  process.exit(0);
}
