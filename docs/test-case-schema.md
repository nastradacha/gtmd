# Test Case Frontmatter Schema v2

This document defines the standardized frontmatter schema for test cases in the GTMD system.

## Overview

All test case files (`.md` files under `qa-testcases/`) must include a YAML frontmatter block at the beginning of the file. This frontmatter provides structured metadata that enables traceability, filtering, and reporting.

## Schema Fields

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `title` | string | Test case title | `"Login with valid credentials"` |
| `steps` | string | Test execution steps | `"1. Navigate to login\n2. Enter credentials\n3. Click login"` |
| `expected` | string | Expected results | `"User is logged in and redirected to dashboard"` |

### Optional Fields

| Field | Type | Description | Example | Validation |
|-------|------|-------------|---------|------------|
| `story_id` | string | Linked story ID | `"123"`, `"US-123"`, `"#123"` | - |
| `suite` | string | Test suite name | `"Authentication"`, `"Smoke"`, `"Regression"` | - |
| `priority` | string | Test priority | `"P1"`, `"P2"`, `"P3"` | Must be P1, P2, or P3 |
| `component` | string | Component under test | `"Login"`, `"Checkout"`, `"Dashboard"` | - |
| `preconditions` | string | Setup requirements | `"User account exists in database"` | - |
| `data` | string | Test data notes | `"username: test@example.com, password: Test123!"` | - |
| `env` | string | Target environment | `"dev"`, `"staging"`, `"prod"` | - |
| `app_version` | string | Target app version | `"v2.5.0"`, `"build-1234"` | - |
| `owner` | string | Test case author | `"john.doe"` | - |
| `assigned_to` | string | Assigned tester | `"jane.smith"` | - |
| `status` | string | Test case status | `"Draft"`, `"Ready"`, `"Approved"`, `"Obsolete"` | Must be one of the four values |
| `created` | string | Creation timestamp | `"2025-01-15T10:30:00Z"` | ISO 8601 format |
| `created_by` | string | Creator username | `"john.doe"` | - |

## Example Test Case

```markdown
---
title: "Login with valid credentials"
story_id: "123"
priority: "P1"
suite: "Authentication"
component: "Login"
preconditions: "User account exists in database"
data: "username: testuser@example.com, password: Test123!"
steps: "1. Navigate to login page\n2. Enter username\n3. Enter password\n4. Click login button"
expected: "User is logged in and redirected to dashboard"
env: "staging"
status: "Ready"
created: "2025-01-15T10:30:00Z"
created_by: "john.doe"
assigned_to: "jane.smith"
---

# Login with valid credentials

## Story Reference
Story #123

## Preconditions
User account exists in database

## Test Data
- username: testuser@example.com
- password: Test123!

## Test Steps
1. Navigate to login page
2. Enter username
3. Enter password
4. Click login button

## Expected Results
User is logged in and redirected to dashboard

## Metadata
- **Priority**: P1
- **Suite**: Authentication
- **Component**: Login
- **Environment**: staging
```

## CI Validation

All test cases are automatically validated on pull requests using GitHub Actions. The validation checks:

1. **Required fields** - `title`, `steps`, `expected` must be present and non-empty
2. **Priority values** - If present, must be `P1`, `P2`, or `P3`
3. **Status values** - If present, must be `Draft`, `Ready`, `Approved`, or `Obsolete`
4. **Unknown fields** - Warns about fields not in the schema (non-blocking)
5. **Body sections** - Warns if steps/expected are only in frontmatter but not in body (non-blocking)

## Best Practices

### 1. Always Include Required Fields
```yaml
title: "Test case title"
steps: "Detailed steps"
expected: "Expected outcome"
```

### 2. Link to Stories
Use the GitHub issue number for traceability:
```yaml
story_id: "123"  # Links to issue #123
```

### 3. Use Consistent Priority Values
```yaml
priority: "P1"  # Critical
priority: "P2"  # High
priority: "P3"  # Medium
```

### 4. Set Status for Workflow Tracking
```yaml
status: "Draft"     # Work in progress
status: "Ready"     # Ready for review
status: "Approved"  # Reviewed and approved
status: "Obsolete"  # No longer valid
```

### 5. Group Tests by Suite
```yaml
suite: "Smoke"       # Quick critical path tests
suite: "Regression"  # Full regression suite
suite: "Authentication"  # Feature-specific suite
```

### 6. Document Preconditions and Test Data
```yaml
preconditions: "User must be logged out"
data: "Valid credentials: user@example.com / Test123!"
```

## Migration from Old Schema

If you have existing test cases without the full schema, they will continue to work (backward compatible). However, we recommend updating them to include at least:

- `title` (required)
- `story_id` (for traceability)
- `priority` (for filtering)
- `suite` (for organization)
- `status` (for workflow tracking)

## Validation Script

You can validate test cases locally before committing:

```bash
node .github/scripts/validate-testcases.js qa-testcases/manual/General/TC-123-test.md
```

Or validate all test cases:

```bash
find qa-testcases -name "*.md" -exec node .github/scripts/validate-testcases.js {} +
```

## Questions?

For questions or suggestions about the schema, please open an issue or discuss in team meetings.
