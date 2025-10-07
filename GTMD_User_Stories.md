
# 📝 GTMD — Detailed User Stories

## 🧠 1. Authentication & Onboarding

### 1.1 User Login with GitHub
- **As a** QA tester  
- **I want** to log into the GTMD dashboard using my GitHub account  
- **So that** I can access test cases, issues, and project boards tied to my GitHub identity.  

**Acceptance Criteria**
- User can click “Sign in with GitHub.”  
- If not authorized, GitHub OAuth consent screen appears.  
- If authorized, the user is redirected to the dashboard.  
- Session persists until logout or expiration.  

**Priority:** P1  
**Story Points:** 3
**Status:** Completed

---

### 1.2 GitHub Permissions & Repo Linking
- **As an** administrator  
- **I want** to configure which GitHub repos are used for Stories and Test Cases  
- **So that** all data is pulled from the correct sources.  

**Acceptance Criteria**
- Admin can set `STORIES_REPO` and `TESTCASES_REPO` in environment.  
- App verifies access to the repo.  
- Errors are shown if the GitHub token does not have `repo` scope or lacks access.  

**Priority:** P1  
**Story Points:** 3

---

## 📋 2. Story Management

### 2.1 View Stories Board
- **As a** tester  
- **I want** to view a list or Kanban board of user stories (GitHub issues)  
- **So that** I can see which stories are in progress, done, or not started.  

**Acceptance Criteria**
- Stories are fetched from GitHub Issues in `STORIES_REPO`.  
- Issues are grouped by label, milestone, or project status.  
- Columns: Backlog, In Progress, Done.  
- Clicking a story shows full details.  

**Priority:** P1  
**Story Points:** 5
**Status:** Completed

---

### 2.2 Filter and Search Stories
- **As a** tester  
- **I want** to filter stories by label, milestone, or assignee  
- **So that** I can focus on relevant stories.  

**Acceptance Criteria**
- Filters available: label, milestone, assignee.  
- Search box matches title or issue number.  
- Multiple filters can be applied simultaneously.  

**Priority:** P2  
**Story Points:** 3

---

### 2.3 Link Test Cases to Stories
- **As a** QA lead  
- **I want** to link Markdown test cases to specific user stories  
- **So that** I can track coverage.  

**Acceptance Criteria**
- UI shows story details + linked test cases.  
- Links are based on a reference (e.g., story ID in the test case header).  
- Unlinked stories are highlighted as gaps.  

**Priority:** P1  
**Story Points:** 5

---

## 🧪 3. Test Case Management

### 3.1 View Test Case List
- **As a** tester  
- **I want** to view a list of Markdown test cases from GitHub  
- **So that** I can select and execute them.  

**Acceptance Criteria**
- App fetches files from `qa-testcases/manual` folder.  
- File names (e.g., `TC-001_login.md`) appear in a scrollable list.  
- Clicking shows Markdown-rendered content in the preview panel.  

**Priority:** P1  
**Story Points:** 5

---

### 3.2 Create New Test Case
- **As a** tester  
- **I want** to create new test cases via the dashboard  
- **So that** I don’t have to manually push Markdown files to GitHub.  

**Acceptance Criteria**
- Form includes: Title, Story ID, Steps, Expected Results, Priority, Suite.  
- Submitting creates a `.md` file via GitHub API (branch + PR).  
- PR appears for review before merging.  

**Priority:** P1  
**Story Points:** 8
**Status:** Completed

---

### 3.3 Review & Approve Test Cases
- **As a** QA lead  
- **I want** to review submitted test cases  
- **So that** only valid cases are merged.  

**Acceptance Criteria**
- New test cases are created as PRs.  
- Reviewers can comment or approve directly from the dashboard.  
- Status updates: Draft → Review → Approved.  

**Priority:** P2  
**Story Points:** 5

---

### 3.4 Markdown Rendering
- **As a** tester  
- **I want** to see test cases rendered nicely  
- **So that** they are easy to read during execution.  

**Acceptance Criteria**
- Markdown is rendered with headings, code blocks, bullet points, etc.  
- Supports highlighting expected results in bold.  

**Priority:** P2  
**Story Points:** 3

---

## 🐞 4. Defect Management

### 4.1 Log a Defect
- **As a** tester  
- **I want** to log a defect directly from the dashboard  
- **So that** I can link it to the test case and story.  

**Acceptance Criteria**
- Defect form includes: Title, Description, Severity, Priority, Story ID, Test Case ID.  
- Creates a GitHub issue in the `STORIES_REPO` with `bug` label.  
- Links back to relevant story and test case.  

**Priority:** P1  
**Story Points:** 5

---

### 4.2 View Defect List & Status
- **As a** QA lead  
- **I want** to view defects by severity, status, and assignee  
- **So that** I can triage effectively.  

**Acceptance Criteria**
- Defects are fetched from GitHub issues with `bug` label.  
- List can be filtered by severity, status, or assignee.  
- Shows issue number, title, severity, status.  

**Priority:** P2  
**Story Points:** 4
**Status:** Completed

---

## 📊 5. Dashboard & Reporting

### 5.1 Story Coverage Report
- **As a** QA lead  
- **I want** to see how many stories have linked test cases  
- **So that** I can track coverage.  

**Acceptance Criteria**
- Displays total stories, linked stories, and % coverage.  
- Unlinked stories are listed for action.  

**Priority:** P1  
**Story Points:** 5

---

### 5.2 Defect Trend Chart
- **As a** QA manager  
- **I want** to see defect trends by severity over time  
- **So that** I can track quality improvements.  

**Acceptance Criteria**
- Chart shows defect counts by severity over time.  
- Pulls data from GitHub issue creation & closure dates.  

**Priority:** P2  
**Story Points:** 5

---

### 5.3 Export Reports
- **As a** QA lead  
- **I want** to export coverage and defect data to CSV or PDF  
- **So that** I can share reports with stakeholders.  

**Acceptance Criteria**
- Export buttons available on dashboard.  
- Generates CSV/PDF with summary and details.  

**Priority:** P3  
**Story Points:** 3

---

## 🛠 6. Admin & Config

### 6.1 Environment Configuration
- **As an** admin  
- **I want** to configure GitHub repo names and auth secrets  
- **So that** the dashboard connects correctly to my organization.  

**Acceptance Criteria**
- `.env.local` contains keys: `GITHUB_ID`, `GITHUB_SECRET`, `TESTCASES_REPO`, `STORIES_REPO`.  
- Missing or invalid config shows descriptive error in UI.  

**Priority:** P1  
**Story Points:** 3

---

### 6.2 Role-Based Access (Future)
- **As an** admin  
- **I want** to assign roles (Tester, QA Lead, Admin)  
- **So that** I can control who can create, review, or configure.  

**Acceptance Criteria**
- Role definitions stored in a config file.  
- Different UI permissions based on role.  

**Priority:** P3  
**Story Points:** 8

---

## 🚀 7. Workflow Enhancements

### 7.1 Edit Test Case (with Audit)
- **As a** tester  
- **I want** to edit existing Markdown test cases  
- **So that** I can refine steps and expectations over time.  

**Acceptance Criteria**
- Users can open a test case, edit content, and save.  
- Edits are committed to GitHub with "updated_by" and timestamp in frontmatter.  
- Change history visible via GitHub commit log.  

**Priority:** P1  
**Story Points:** 5  
**Status:** In Progress

---

### 7.2 Execute Test Case (Pass/Fail)
- **As a** tester  
- **I want** to record execution results (pass/fail)  
- **So that** I can track run outcomes against stories.  

**Acceptance Criteria**
- Button to mark Pass or Fail with optional notes.  
- Result saved to repo under `qa-runs/` with user and timestamp.  
- Optional PR created to capture audit trail.  

**Priority:** P1  
**Story Points:** 5  
**Status:** In Progress

---

### 7.3 Assign Stories (Self/Developer)
- **As a** tester  
- **I want** to assign stories to myself or a developer  
- **So that** ownership is clear during triage and execution.  

**Acceptance Criteria**
- Buttons: “Assign to me”, “Assign to…”, “Unassign”.  
- Uses GitHub Issues assignees API.  
- Visible on Stories and Defects pages.  

**Priority:** P1  
**Story Points:** 3  
**Status:** Planned

---

### 7.4 Edit Defect with Audit
- **As a** QA lead  
- **I want** to edit defect details and track who edited  
- **So that** updates are auditable.  

**Acceptance Criteria**
- Update title/body/labels via dashboard.  
- Add a GitHub issue comment noting editor and timestamp.  
- Preserve full edit history in GitHub.  

**Priority:** P2  
**Story Points:** 3  
**Status:** Planned

---

## 📎 Summary Table

| Area | Stories | Points | Priority |
|------|---------|--------|----------|
| Auth & Onboarding | 2 | 6 | P1 |
| Story Management | 3 | 13 | P1–P2 |
| Test Cases | 4 | 21 | P1–P2 |
| Defects | 2 | 9 | P1–P2 |
| Dashboard & Reports | 3 | 13 | P1–P3 |
| Admin | 2 | 11 | P1–P3 |
| **Total** | 16 stories | **73 points** | — |
