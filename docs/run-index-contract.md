# Test Run Index Contract

## Overview

To improve performance of the traceability matrix, GTMD maintains a `latest.json` index file for each test case that has been executed. This index provides O(1) lookup of the latest test result without scanning all run files.

## Index Location

For a test case at path `qa-testcases/manual/General/TC-123-test.md`, the index is stored at:

```
qa-runs/qa-testcases__manual__General__TC-123-test.md/latest.json
```

**Path encoding:**
- Forward slashes (`/`) are replaced with double underscores (`__`)
- File extensions (`.md`) are preserved
- The run directory mirrors the test case path structure

## Index Schema

### latest.json Structure

```json
{
  "result": "pass",
  "executed_at": "2025-01-15T10:30:00.000Z",
  "executed_by": "john.doe",
  "run_file": "run-1736936400000.json",
  "updated_at": "2025-01-15T10:30:00.000Z"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `result` | string | Yes | Test result: `"pass"`, `"fail"`, or `"skip"` |
| `executed_at` | string | Yes | ISO 8601 timestamp of test execution |
| `executed_by` | string | Yes | GitHub username of tester |
| `run_file` | string | Yes | Filename of the actual run file (e.g., `run-1736936400000.json`) |
| `updated_at` | string | Yes | ISO 8601 timestamp when index was last updated |

## Maintenance

### Automatic Updates

The index is automatically created/updated when:
1. A test result is recorded via `/api/github/testcases/result`
2. A bulk run session is submitted via `/runs` page

The result API handles:
- Creating `latest.json` if it doesn't exist
- Updating `latest.json` if a newer result is recorded
- Including the file SHA for atomic updates

### Manual Backfill

For existing test runs without indices, use the backfill script:

```bash
node .github/scripts/backfill-latest-index.js <GITHUB_TOKEN> <OWNER> <REPO>
```

**Example:**
```bash
node .github/scripts/backfill-latest-index.js ghp_xxx nastradacha wazobia_test_case
```

The script:
- Scans all `qa-runs/` directories
- Identifies the latest run file per directory
- Creates `latest.json` if missing
- Skips directories that already have an index
- Respects GitHub API rate limits (100ms delay between requests)

## Fallback Behavior

The traceability matrix aggregator (`/api/traceability/matrix`) implements graceful fallback:

1. **Primary:** Try to fetch `latest.json` for each test
2. **Fallback:** If `latest.json` doesn't exist, scan all run files in the directory and find the latest by timestamp

This ensures:
- ✅ Fast performance when indices exist
- ✅ Backward compatibility with old runs
- ✅ No data loss if indices are missing

## Performance Impact

### Without Index
- **API Calls:** N calls (where N = number of run files)
- **Time:** ~100-500ms per test depending on run history
- **Example:** 50 tests with 10 runs each = 500 API calls

### With Index
- **API Calls:** 1 call per test
- **Time:** ~10-50ms per test
- **Example:** 50 tests = 50 API calls

**Performance gain:** ~10x faster matrix loading

## Best Practices

### For Developers

1. **Always update the index** when recording test results
2. **Don't delete indices** unless regenerating them
3. **Include error handling** - index updates should not block test result recording
4. **Use atomic updates** - always include SHA when updating existing indices

### For Testers

1. **Run backfill script** after bulk importing historical test results
2. **Verify indices** if matrix loading seems slow
3. **Report missing indices** if you notice performance degradation

### For CI/CD

1. **Validate index format** in automated tests
2. **Monitor index coverage** (percentage of tests with indices)
3. **Alert on missing indices** for active test cases

## Troubleshooting

### Matrix loads slowly

**Symptom:** Traceability page takes >5 seconds to load

**Solution:**
1. Check if `latest.json` files exist in `qa-runs/` directories
2. Run backfill script to generate missing indices
3. Verify indices are being created for new test runs

### Index out of sync

**Symptom:** Latest run result doesn't match what's shown in matrix

**Solution:**
1. Check the `run_file` field in `latest.json`
2. Verify the referenced run file exists and has correct data
3. Manually update or delete `latest.json` to trigger regeneration

### Backfill script fails

**Common causes:**
- Invalid GitHub token
- Rate limit exceeded (wait and retry)
- Network connectivity issues
- Insufficient permissions (needs repo write access)

**Solution:**
- Verify token has `repo` scope
- Add delays between batches
- Run script in smaller chunks

## Migration Guide

### Existing Deployments

If you have an existing GTMD deployment with test runs but no indices:

1. **Backup your repository** (optional but recommended)
2. **Run the backfill script:**
   ```bash
   node .github/scripts/backfill-latest-index.js $GITHUB_TOKEN owner repo
   ```
3. **Verify indices were created:**
   ```bash
   # Count latest.json files
   find qa-runs -name "latest.json" | wc -l
   ```
4. **Test the matrix:**
   - Navigate to `/traceability?nocache=1`
   - Verify load time improved
   - Check that all test results display correctly

### New Deployments

For new deployments, indices are created automatically. No action needed.

## API Reference

### Creating an Index

```typescript
POST /api/github/testcases/result
{
  "path": "qa-testcases/manual/General/TC-123-test.md",
  "result": "pass",
  "notes": "Test passed successfully"
}
```

This automatically creates/updates:
- `qa-runs/qa-testcases__manual__General__TC-123-test.md/run-<timestamp>.json`
- `qa-runs/qa-testcases__manual__General__TC-123-test.md/latest.json`

### Reading an Index

The matrix aggregator reads indices automatically. No direct API endpoint.

## Future Enhancements

Potential improvements to the index system:

1. **Run history summary** - Include pass/fail counts in index
2. **Trend data** - Track pass rate over last N runs
3. **Performance metrics** - Record execution time per test
4. **Batch updates** - Update multiple indices in one commit
5. **Index validation** - Automated checks for index integrity

## Questions?

For questions about the index system, please:
- Check this documentation first
- Review the implementation in `app/api/github/testcases/result/route.ts`
- Open an issue if you find bugs or have suggestions
