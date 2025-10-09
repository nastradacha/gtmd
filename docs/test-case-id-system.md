# Test Case ID System

## Overview

GTMD uses a sequential ID system for test cases, making them easy to remember and reference.

## ID Format

**New Format (Sequential):**
- `TC-001`, `TC-002`, `TC-003`, etc.
- Short, memorable, and easy to reference
- Automatically incremented for each new test case

**Old Format (Timestamp-based):**
- `TC-1736936400000` (13-digit Unix timestamp)
- Used in earlier versions
- Still supported for backward compatibility

## How It Works

### Creating a New Test Case

1. When you create a test case, the system:
   - Reads the current counter from `.gtmd/testcase-counter.txt`
   - Increments the counter
   - Creates the test case with the new ID
   - Updates the counter file

2. **Example:**
   - Current counter: `5`
   - New test case created: `TC-006-login-test.md`
   - Counter updated to: `6`

### ID Structure

**Filename format:**
```
TC-{ID}-{slug}.md
```

**Examples:**
- `TC-001-login-with-valid-credentials.md`
- `TC-002-password-reset-flow.md`
- `TC-123-checkout-process.md`

### Counter File

**Location:** `.gtmd/testcase-counter.txt` in your test case repository

**Content:** A single number representing the last used ID

**Example:**
```
123
```

This means the next test case will be `TC-124`.

## Benefits

### ✅ Easy to Remember
- "Did you run TC-45?" is easier than "Did you run TC-1736936400000?"
- Students can quickly reference test cases in discussions

### ✅ Easy to Reference in Defects
- When creating a defect, you can easily type `TC-042`
- No need to copy-paste long IDs

### ✅ Sequential and Organized
- IDs increment over time
- Easy to see how many test cases exist
- `TC-150` means you have at least 150 test cases

### ✅ Backward Compatible
- Old timestamp-based IDs still work
- Displayed as `TC-173693...` in the UI
- No migration needed

## Setup for New Repositories

### Option 1: Automatic (Recommended)

The counter file is created automatically when you create your first test case.

### Option 2: Manual Setup

If you want to start at a specific number:

1. Create `.gtmd/testcase-counter.txt` in your repository
2. Add the starting number (e.g., `100` to start at TC-101)
3. Commit the file

**Example:**
```bash
mkdir -p .gtmd
echo "0" > .gtmd/testcase-counter.txt
git add .gtmd/testcase-counter.txt
git commit -m "Initialize test case counter"
git push
```

## Migration from Old Format

If you have existing test cases with timestamp-based IDs:

### Option 1: Keep Both (Recommended)
- Old test cases keep their timestamp IDs
- New test cases use sequential IDs
- Both formats work side-by-side

### Option 2: Renumber Everything
1. Count your existing test cases
2. Set the counter to that number
3. Optionally rename old files (manual process)

**We recommend Option 1** - no migration needed!

## Troubleshooting

### Issue: Counter file not found

**Symptom:** First test case creation fails

**Solution:**
1. Create the counter file manually (see Setup above)
2. Or, the system will auto-create it starting at 1

### Issue: Duplicate IDs

**Symptom:** Two test cases have the same ID

**Cause:** Counter file was manually edited or reset

**Solution:**
1. Find the highest existing TC-ID
2. Update counter file to that number
3. Create new test case (will use next number)

### Issue: Counter out of sync

**Symptom:** New test case has ID lower than existing ones

**Solution:**
```bash
# Find highest ID
ls qa-testcases/**/*.md | grep -oP 'TC-\K\d+' | sort -n | tail -1

# Update counter (replace 123 with the highest ID found)
echo "123" > .gtmd/testcase-counter.txt
git add .gtmd/testcase-counter.txt
git commit -m "Fix test case counter"
git push
```

## Best Practices

### ✅ DO:
- Let the system manage the counter automatically
- Use the full TC-ID when referencing test cases
- Include TC-ID in defect descriptions

### ❌ DON'T:
- Manually edit the counter file (unless fixing issues)
- Skip numbers (let the system increment naturally)
- Reuse deleted test case IDs

## Examples

### Creating a Test Case

**Input:**
- Title: "Login with valid credentials"
- Current counter: 42

**Result:**
- Filename: `TC-043-login-with-valid-credentials.md`
- Display ID: `TC-043`
- Counter updated to: 43

### Referencing in Defects

**Good:**
```markdown
## Steps to Reproduce
1. Run test case TC-045
2. Observe the login button
3. Click submit

## Expected
Test TC-045 should pass

## Actual
Test TC-045 fails at step 3
```

**Bad:**
```markdown
## Steps to Reproduce
1. Run test case TC-1736936400000
2. ... (hard to remember and type)
```

## FAQ

**Q: What happens if I delete a test case?**
A: The ID is not reused. If you delete TC-050, the next test case will still be TC-051.

**Q: Can I start numbering at 100 instead of 1?**
A: Yes! Create the counter file with `99` and the first test case will be TC-100.

**Q: What if two people create test cases at the same time?**
A: GitHub's PR system prevents conflicts. The second PR will update the counter based on the merged state.

**Q: Can I change an existing test case's ID?**
A: Not recommended. The ID is part of the filename. Changing it would break references and history.

**Q: How many digits can the ID have?**
A: The system pads to 3 digits (TC-001) but supports any number of digits (TC-1234, TC-99999, etc.)

## Summary

The sequential ID system makes test cases:
- ✅ Easy to remember
- ✅ Easy to reference
- ✅ Easy to communicate
- ✅ Professional and organized

Perfect for teaching environments where students need to quickly reference and discuss test cases!
