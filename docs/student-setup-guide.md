# GTMD Student Setup Guide

## Quick Start (3 Options)

### 🎓 Option 1: Demo Mode (Easiest - No GitHub Setup Required)

**Best for:** First-time users, learning the interface, practicing workflows

1. Visit the GTMD application URL provided by your instructor
2. Click **"Try Demo Mode"** on the login page
3. Explore all features with sample data
4. **Note:** Changes in demo mode are not saved

**What you can do in demo mode:**
- ✅ View stories and test cases
- ✅ Navigate the traceability matrix
- ✅ Practice using filters and saved views
- ✅ Export CSV reports
- ❌ Cannot create new test cases
- ❌ Cannot record test results
- ❌ Cannot create defects

---

### 🔧 Option 2: Quick Setup with Instructor's OAuth App (Recommended)

**Best for:** Students who want to create and modify content

**Prerequisites:**
- GitHub account (free)
- Access to instructor's test case repository

**Steps:**

1. **Get GitHub Account**
   - Go to https://github.com/signup
   - Create a free account (takes 2 minutes)
   - Verify your email

2. **Get Repository Access**
   - Ask your instructor to invite you to the test case repository
   - Accept the invitation email from GitHub

3. **Sign In to GTMD**
   - Visit the GTMD application URL
   - Click **"Sign in with GitHub"**
   - Click **"Authorize"** when prompted
   - You're in! 🎉

**Troubleshooting:**
- **"Not authenticated" error**: Make sure you accepted the repository invitation
- **"Access denied" error**: Contact your instructor to verify repository permissions
- **OAuth error**: Try signing out of GitHub and signing in again

---

### 🚀 Option 3: Full Setup (Your Own Instance)

**Best for:** Advanced students, personal projects, portfolio work

This option requires setting up your own GitHub OAuth app and repositories.

#### Step 1: Create GitHub Repositories

1. Go to https://github.com/new
2. Create **two repositories**:
   - `my-stories` (for issues/stories)
   - `my-testcases` (for test case files)
3. Make both repositories **Public** or **Private** (your choice)

#### Step 2: Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click **"OAuth Apps"** → **"New OAuth App"**
3. Fill in:
   - **Application name**: `My GTMD Dashboard`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Click **"Register application"**
5. **Copy the Client ID**
6. Click **"Generate a new client secret"**
7. **Copy the Client Secret** (you won't see it again!)

#### Step 3: Clone and Configure GTMD

```bash
# Clone the repository
git clone <gtmd-repo-url>
cd gtmd

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

#### Step 4: Edit `.env.local`

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
GITHUB_ID=<your-oauth-client-id>
GITHUB_SECRET=<your-oauth-client-secret>
STORIES_REPO=<your-username>/my-stories
TESTCASES_REPO=<your-username>/my-testcases
NEXT_PUBLIC_TESTCASES_REPO=<your-username>/my-testcases
```

#### Step 5: Set Up Test Case Repository Structure

In your `my-testcases` repository, create:

```
qa-testcases/
└── manual/
    └── General/
        └── TC-001-example.md
```

**Example test case** (`TC-001-example.md`):

```markdown
---
title: Example test case
story_id: 1
priority: P2
suite: General
steps: "1. Do something\n2. Check result"
expected: "It works"
---

# Example Test Case

## Test Steps
1. Do something
2. Check result

## Expected Results
It works
```

#### Step 6: Run the Application

```bash
npm run dev
```

Visit http://localhost:3000 and sign in!

---

## Common Issues & Solutions

### Issue: "OAuth App not configured"

**Solution:**
- Check that `GITHUB_ID` and `GITHUB_SECRET` are set in `.env.local`
- Restart the dev server after changing `.env.local`

### Issue: "Repository not found"

**Solution:**
- Verify repository names in `.env.local` match your GitHub repos
- Check that repositories exist and you have access
- Format should be: `username/repo-name`

### Issue: "Not authenticated" when accessing pages

**Solution:**
- Sign out and sign in again
- Clear browser cookies
- Check that OAuth callback URL matches exactly: `http://localhost:3000/api/auth/callback/github`

### Issue: "Access token missing"

**Solution:**
- Make sure your OAuth app has the correct scopes: `read:user repo project`
- Revoke and re-authorize the OAuth app

---

## Getting Help

1. **Check the documentation**: `/docs` folder in the repository
2. **Ask your instructor**: They can verify your setup
3. **Check GitHub Issues**: See if others had the same problem
4. **Demo mode**: Use demo mode to continue learning while troubleshooting

---

## Next Steps After Setup

Once you're signed in:

1. **Explore the Dashboard** (`/dashboard`)
   - View coverage metrics
   - See recent activity

2. **Browse Stories** (`/stories`)
   - Filter by label, milestone, assignee
   - View story details

3. **View Test Cases** (`/testcases`)
   - Browse existing test cases
   - Try creating a new one

4. **Check Traceability** (`/traceability`)
   - See test coverage per story
   - Use filters and saved views

5. **Run Tests** (`/runs`)
   - Create a test session
   - Execute tests in bulk

6. **View Reports** (`/reports`)
   - Generate coverage reports
   - Export to CSV

---

## Tips for Success

✅ **Start with demo mode** to learn the interface
✅ **Use Option 2** (instructor's OAuth) for class projects
✅ **Use Option 3** (your own setup) for portfolio projects
✅ **Ask questions early** - don't struggle alone!
✅ **Practice regularly** - hands-on experience is key

Happy testing! 🧪✨
