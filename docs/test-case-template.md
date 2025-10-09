# Test Case Template

This template shows the proper format for creating test cases that work with GTMD's test execution features.

## Template 1: Using YAML Block Scalars (Recommended - Easier to Read)

```yaml
---
title: "Test Case Title - What are you testing?"
story_id: "21"
suite: "General"
priority: "P2"
component: "ComponentName"
assigned_to: "yourusername"
status: "Ready"
preconditions: |
  - User account exists in the system
  - User is logged out
  - Browser cache is cleared
steps: |
  1. Navigate to the login page
  2. Enter valid username in the username field
  3. Enter valid password in the password field
  4. Click the "Login" button
  5. Wait for page to load
  6. Verify user is redirected to dashboard
expected: |
  - User successfully logs in
  - Dashboard page loads within 2 seconds
  - User's name is displayed in the header
  - Welcome message is shown
---

## Additional Test Details (Optional)

You can add more context here in regular Markdown format:
- Screenshots
- Reference links
- Notes about edge cases
- etc.
```

## Template 2: Using Escaped Newlines (Works Everywhere)

```yaml
---
title: "Test Case Title - What are you testing?"
story_id: "21"
suite: "General"
priority: "P2"
component: "ComponentName"
assigned_to: "yourusername"
status: "Ready"
preconditions: "User account exists in the system\nUser is logged out\nBrowser cache is cleared"
steps: "1. Navigate to the login page\n2. Enter valid username in the username field\n3. Enter valid password in the password field\n4. Click the Login button\n5. Wait for page to load\n6. Verify user is redirected to dashboard"
expected: "User successfully logs in\nDashboard page loads within 2 seconds\nUser's name is displayed in the header\nWelcome message is shown"
---

## Additional Test Details (Optional)

More context here...
```

## Field Descriptions

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `title` | ✅ Yes | Clear description of what is being tested | "Login with valid credentials" |
| `story_id` | ✅ Yes | GitHub issue number of related story | "21" or "MS-005" |
| `suite` | Recommended | Test suite category | "Regression", "General", "Messages" |
| `priority` | Recommended | Test priority | "P1", "P2", "P3" |
| `component` | Recommended | Component being tested | "Login", "Messages", "Dashboard" |
| `preconditions` | Recommended | What must be true before test starts | See examples above |
| `steps` | ✅ **CRITICAL** | Detailed test steps | See examples above |
| `expected` | ✅ **CRITICAL** | Expected results | See examples above |
| `assigned_to` | Optional | GitHub username of tester | "nastradacha" |
| `status` | Optional | Test case status | "Ready", "Draft", "Blocked" |
| `data` | Optional | Test data needed | "username: test@example.com" |
| `env` | Optional | Environment to test | "dev", "staging", "prod" |

## Real Example: Message Screen Test Case

```yaml
---
title: "Verify seller name and buyer name displayed on messages screen"
story_id: "21"
suite: "Messages"
priority: "P3"
component: "messages"
assigned_to: "nastradacha"
status: "Ready"
preconditions: |
  - Two user accounts exist (one seller, one buyer)
  - Both users have valid credentials
  - At least one message thread exists between seller and buyer
steps: |
  1. Open the application in a browser
  2. Login as the seller using valid credentials
  3. Navigate to the Messages section
  4. Send a new message to the buyer
  5. Logout from seller account
  6. Login as the buyer using valid credentials
  7. Navigate to the Messages section
  8. Open the message thread with the seller
  9. Verify the seller's name is displayed in the message thread
  10. Verify the buyer's name is displayed in the message thread
  11. Check that both names are clearly visible and correctly formatted
expected: |
  - Seller name appears correctly in the message thread
  - Buyer name appears correctly in the message thread
  - Both names are clearly visible and easy to read
  - Names match the actual user accounts
  - No placeholder text or missing data
---

## Notes

This test verifies the user story requirement that both seller and buyer names 
should be clearly displayed on the messages screen to avoid confusion about 
who is communicating.
```

## Quick Start Guide

### Step 1: Copy the Template
Copy Template 1 (YAML block scalars) as your starting point.

### Step 2: Fill in Your Details
- Replace `"yourusername"` with your GitHub username
- Set the `story_id` to match your user story
- Choose appropriate `suite`, `priority`, and `component`

### Step 3: Write Clear Steps
Number your steps clearly:
```yaml
steps: |
  1. First action
  2. Second action
  3. Third action
  4. Verify something
```

### Step 4: Define Expected Results
Be specific about what should happen:
```yaml
expected: |
  - Specific outcome 1
  - Specific outcome 2
  - Measurable result (e.g., "loads in < 2 seconds")
```

### Step 5: Save with Proper Naming
Save as: `TC-XXX-description.md` where XXX is the test case number.

Example: `TC-042-verify-message-names.md`

## Tips for Writing Good Test Cases

### ✅ DO:
- Write steps anyone can follow
- Be specific about expected results
- Include preconditions
- Number steps sequentially
- Use action verbs (Navigate, Click, Enter, Verify)

### ❌ DON'T:
- Leave `steps` or `expected` empty
- Use vague language ("Make sure it works")
- Skip preconditions
- Assume knowledge (be explicit)

## Testing Your Test Case

After creating your test case:

1. **Commit and push** to your repository
2. **Go to GTMD** → Runs page
3. **Start a session** with your test case
4. **Expand the test** by clicking the arrow
5. **Verify** you see all three sections:
   - 📋 Preconditions
   - 🔢 Test Steps
   - ✅ Expected Results

If any section is missing, check your YAML syntax!

## Common YAML Formatting Issues

### Issue 1: Missing Pipe Character
```yaml
# ❌ WRONG - Multi-line without pipe
steps:
  1. Step one
  2. Step two

# ✅ CORRECT
steps: |
  1. Step one
  2. Step two
```

### Issue 2: Inconsistent Indentation
```yaml
# ❌ WRONG - Mixed indentation
steps: |
  1. Step one
    2. Step two  # Too much indent
  3. Step three

# ✅ CORRECT
steps: |
  1. Step one
  2. Step two
  3. Step three
```

### Issue 3: Missing Quotes for Special Characters
```yaml
# ❌ WRONG - Colon in value without quotes
title: Test: Login Feature

# ✅ CORRECT
title: "Test: Login Feature"
```

## Need Help?

- See `docs/test-case-schema.md` for full field descriptions
- Check existing test cases in your repository for examples
- Ask your instructor if you're unsure about formatting
