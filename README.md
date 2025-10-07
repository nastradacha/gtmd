# GTMD - GitHub Test Management Dashboard

A lightweight Jira-like dashboard that integrates directly with GitHub for story management, test case management, defect tracking, and QA reporting.

## 🚀 Features

- **GitHub OAuth Authentication** - Secure login with GitHub
- **Story Management** - View GitHub Issues in Kanban board with filters
- **Test Case Management** - Create, view, and review Markdown test cases stored in GitHub
- **Defect Management** - Log defects as GitHub issues with severity tracking
- **Dashboard & Reporting** - Coverage metrics, defect trends, and CSV export
- **Peer Review Workflow** - Test cases created as PRs for team review

## 📋 Prerequisites

- Node.js 18+ and npm
- GitHub account
- Two GitHub repositories:
  1. **Stories/Defects Repo** - For GitHub Issues (stories and bugs)
  2. **Test Cases Repo** - For Markdown test case files

## 🔧 Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd gtmd
npm install
```

### 2. Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
2. Set:
   - **Application name**: GTMD Dashboard
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Click **Register application**
4. Copy the **Client ID** and generate a **Client Secret**

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-random-string>
GITHUB_ID=<your-github-oauth-client-id>
GITHUB_SECRET=<your-github-oauth-client-secret>
STORIES_REPO=<owner/repo-name>
TESTCASES_REPO=<owner/repo-name>
```

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

**Example:**
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=pNn+gGiIWifEJqYBGZalpZJSIprNCTV+en1usjOtU1w=
GITHUB_ID=Ov23ctega7NTJsEXMudu
GITHUB_SECRET=e25adeb8606bc2a9730afefe71e7f555f6d00a4d
STORIES_REPO=nastradacha/live-project
TESTCASES_REPO=nastradacha/qa-testcases
```

### 4. Set Up Test Cases Repository

In your `TESTCASES_REPO`, create this folder structure:

```
qa-testcases/
└── manual/
    ├── TC-001_example.md
    └── TC-002_example.md
```

**Example test case format:**

```markdown
---
title: Login with valid credentials
story_id: 123
priority: P1
suite: Authentication
created: 2025-01-01T00:00:00.000Z
---

# Login with valid credentials

## Story Reference
Story #123

## Test Steps
1. Navigate to login page
2. Enter valid username
3. Enter valid password
4. Click login button

## Expected Results
User should be logged in and redirected to dashboard

## Priority
P1

## Test Suite
Authentication
```

### 5. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

## 📁 Project Structure

```
gtmd/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # NextAuth handlers
│   │   └── github/
│   │       ├── issues/route.ts          # Fetch/create issues
│   │       ├── testcases/
│   │       │   ├── route.ts             # Fetch test cases
│   │       │   └── create/route.ts      # Create test case PR
│   │       ├── me/route.ts              # Get user info
│   │       └── rate/route.ts            # Rate limit info
│   ├── dashboard/page.tsx               # Coverage & metrics
│   ├── stories/page.tsx                 # Kanban board
│   ├── testcases/page.tsx               # Test case viewer/creator
│   ├── defects/page.tsx                 # Defect tracker
│   └── layout.tsx                       # Root layout with nav
├── components/
│   └── Navigation.tsx                   # Top navigation bar
├── lib/
│   ├── auth.ts                          # NextAuth config
│   ├── github.ts                        # GitHub API helpers
│   └── types.ts                         # TypeScript types
└── .env.local                           # Environment variables
```

## ✅ Acceptance Criteria

- [x] GitHub OAuth login works end-to-end
- [x] Stories page lists issues with Kanban view and filters
- [x] Test cases page lists .md files and renders markdown
- [x] Test case creation flow creates a PR successfully
- [x] Defects page logs bugs as GitHub issues with filters
- [x] Dashboard shows coverage metrics and defect trends
- [x] Environment variables are respected
- [x] TypeScript used throughout with proper types
- [x] Error handling in API routes and UI

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Auth**: NextAuth.js v4 with GitHub OAuth
- **Integration**: GitHub REST API
- **Storage**: GitHub repositories (no separate database)

## 📊 Usage

### Dashboard
- View test coverage percentage
- See unlinked stories that need test cases
- Track defects by severity
- Export reports to CSV

### Stories
- View issues in Kanban columns (Backlog, In Progress, Done)
- Filter by label, milestone, assignee
- Search by title or issue number
- Click story to see details

### Test Cases
- Browse existing test cases
- Click to preview markdown content
- Create new test case (opens PR for review)
- Link test cases to stories via story_id

### Defects
- Log new defects with severity and priority
- Link defects to stories and test cases
- Filter by severity and status
- View defect details on GitHub

## 🚢 Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Update `NEXTAUTH_URL` to your production URL
5. Update GitHub OAuth callback URL to production

## 📝 License

MIT

## 🤝 Contributing

This project is designed for educational purposes and QA training. Feel free to fork and customize for your needs.
