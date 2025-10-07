
# 🧭 GitHub Test Management Dashboard (GTMD) — Project Plan

A lightweight Jira-like dashboard that integrates with GitHub for **User Stories**, **Test Case Management**, **Defect Tracking**, and **QA Reporting** — ideal for student training and real project workflows.

---

## 📌 1. Project Overview

The **GTMD Dashboard** is a Next.js application that connects to GitHub using OAuth and REST/GraphQL APIs to provide:

- 📋 **Project & User Story Management** — View and organize GitHub issues & project boards.  
- 🧪 **Test Case Management** — Store and review Markdown-based test cases in a GitHub repo.  
- 🐞 **Defect Management** — Log, triage, and link defects to stories and test cases.  
- 📊 **Reporting** — Live dashboards for coverage, defect trends, and traceability.  
- 👥 **Collaboration** — Students or testers can peer-review test cases, run test cycles, and log defects.

---

## 🧱 2. Tech Stack

| Component             | Technology                      | Rationale |
|-----------------------|----------------------------------|-----------|
| **Frontend**          | Next.js (React) + Tailwind CSS  | Modern, fast, minimal setup |
| **Backend**           | Next.js API Routes (Node)       | Simple, serverless-ready |
| **Database**          | None (GitHub = source of truth) | No extra infra required |
| **Auth**              | GitHub OAuth via NextAuth.js    | Seamless GitHub integration |
| **Integration**       | GitHub REST & GraphQL APIs      | Fetch Issues, Projects, Contents |
| **Hosting**           | Vercel / Render                 | Free tiers, simple deploy |

---

## 🚀 3. Major Features

### 3.1 Project & Story Management
- View GitHub Issues in Kanban/table views.  
- Filter by labels, milestone, sprint.  
- Inline issue creation.

### 3.2 Test Case Management
- Render Markdown test cases stored in a separate repo.  
- Link test cases to user stories.  
- Peer review system for students.

### 3.3 Defect Management
- Log defects via UI → creates GitHub issues with `bug` label.  
- Severity, priority, environment fields.  
- Linked to stories & test cases.

### 3.4 Dashboard & Reporting
- Story coverage (% with test cases).  
- Defect counts by severity & priority.  
- Traceability matrix (Story ⇄ Test Case ⇄ Defect).  
- Export reports (CSV/PDF).

---

## 🧠 4. System Architecture

```
┌──────────────────────────────┐
│        Next.js Frontend      │
│ Pages: Dashboard, Stories,   │
│ Test Cases, Defects          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Next.js API Routes          │
│ Auth with GitHub             │
│ Proxy REST/GraphQL           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        GitHub API            │
│ Issues, Projects, Contents   │
│ OAuth / App Token            │
└──────────────────────────────┘
```

---

## 📅 5. Project Phases & Timeline

| Phase | Name | Duration | Deliverables |
|-------|------|----------|--------------|
| 1 | **Planning & Setup** | 1 week | GitHub app, env setup, wireframes |
| 2 | **Auth & API Layer** | 1 week | GitHub OAuth + REST/GraphQL proxy |
| 3 | **Stories Board UI** | 1.5 weeks | Kanban/table views, filters |
| 4 | **Test Case Viewer** | 1.5 weeks | Markdown rendering, linking |
| 5 | **Defect Management** | 1.5 weeks | Bug form, triage board |
| 6 | **Reporting Dashboard** | 1 week | Metrics, traceability, exports |
| 7 | **Testing & Deployment** | 1 week | QA, CI/CD, onboarding docs |

**Total Estimated Duration:** ~8 weeks

---

## 🧑🏽‍🏫 6. Student Workflow

1. **Sign in** with GitHub.  
2. Pick a **User Story** → write a **Test Case** in Markdown.  
3. Submit a PR → peers review test cases.  
4. Execute test cases → log **Defects** via dashboard.  
5. Track coverage, defect status, and traceability via Dashboard.

---

## 🔐 7. GitHub Repository Setup

You will need two repos:

1. **Stories & Defects Repo**  
   - Holds GitHub Issues for user stories & bugs.  
   - Example: `nastradacha/live-project`

2. **Test Cases Repo**  
   - Stores Markdown test cases in this structure:
   ```
   qa-testcases/
    └─ manual/
        ├─ TC-001_login.md
        └─ TC-002_signup.md
   ```

   - Example: `nastradacha/qa-testcases`

---

## 🧪 8. Success Metrics

- ✅ 80% of stories have linked test cases.  
- 📈 Defect trends and coverage are visible in the dashboard.  
- 🧠 Students understand traceability end-to-end.  
- 🧪 Test cases and defects live entirely in GitHub (no separate DB).

---

## 🛠️ 9. Future Enhancements

- ✅ GitHub Projects v2 GraphQL integration for sprint boards.  
- 🤖 AI-assisted test case generation.  
- 📨 Slack/Discord notifications for defect triage.  
- 📱 Mobile-friendly UI for on-the-go testing.  
- 🧑‍💻 Role-based access & audit trails.

---

## 📝 10. Deployment Notes

- Use **Vercel** for instant hosting.  
- Set environment variables in Vercel dashboard.  
- Update `NEXTAUTH_URL` to production URL after deployment.  
- Keep `.env.local` out of Git (add to `.gitignore`).

---

## 📎 Key Files

```
app/
 ├─ dashboard/page.tsx
 ├─ stories/page.tsx
 ├─ testcases/page.tsx
 ├─ defects/page.tsx
 └─ api/github/*
lib/
 └─ auth.ts
.env.local
```

---

## 🏁 Final Notes

This project turns GitHub into a **lightweight QA management system**, ideal for classrooms or lean QA teams. It teaches students real-world workflows — writing test cases, linking to user stories, reviewing each other's work, logging defects, and tracking quality — all using industry-standard GitHub infrastructure.

