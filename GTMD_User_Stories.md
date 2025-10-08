
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
**Story Points:** 3  **Status:** Planned

 ---
 
 ## 🔗 8. Traceability & Matrix
 
 ### 8.1 Parse story_id from Test Cases
 - **As a** QA lead  
 - **I want** to extract `story_id` from test case frontmatter  
 - **So that** test cases can be linked to stories.
 
 **Acceptance Criteria**
 - `app/api/github/testcases/route.ts` parses `story_id` (quotes optional).  
 - Returned `TestCase` objects include `storyId`.  
 - Pending PR files are also parsed for `story_id`.  
 - Manual verification with sample files or lightweight test.
 
 **Priority:** P1  
 **Story Points:** 3  
 **Status:** Planned
 
 ---
 
 ### 8.2 Traceability Matrix Aggregator API
 - **As a** QA lead  
 - **I want** a single API that aggregates Stories, Test Cases, Latest Runs, and Defects  
 - **So that** I can render a full traceability matrix.
 
 **Acceptance Criteria**
 - New route: `app/api/traceability/matrix/route.ts`.  
 - Aggregates: stories (issues), test cases (with `storyId`), latest run per test from `qa-runs/**`, and defects with links.  
 - Returns gaps: stories without tests, tests without story, defects without links.  
 - Batched GitHub requests; typical response < 2s.
 
 **Priority:** P1  
 **Story Points:** 5  
 **Status:** Planned
 
 ---
 
 ### 8.3 Traceability Matrix UI
 - **As a** QA lead  
 - **I want** a matrix page showing story coverage, latest health, and defects  
 - **So that** I can see quality status at a glance.
 
 **Acceptance Criteria**
 - New page `app/traceability/page.tsx` with nav item "Traceability".  
 - Table columns: Story, Tests, Defects, Coverage, Assignees.  
 - Expand rows to list individual tests with latest Pass/Fail/No Run badges and assignee.  
 - Expand defects with Open/Closed counts and links.  
 - Filters: label, milestone, suite, priority, assignment, folder.  
 - Consumes the matrix API.
 
 **Priority:** P1  
 **Story Points:** 8  
 **Status:** Planned
 
 ---
 
 ### 8.4 Gaps Detection UI
 - **As a** QA lead  
 - **I want** a gaps section listing missing coverage  
 - **So that** I can prioritize work.
 
 **Acceptance Criteria**
 - Cards for: Stories without tests, Test cases without story, Defects without links.  
 - Items are clickable to navigate.  
 - Lives on the Traceability page.
 
 **Priority:** P1  
 **Story Points:** 3  
 **Status:** Planned
 
 ---
 
 ### 8.5 Export Matrix CSV
 - **As a** QA manager  
 - **I want** to export the matrix to CSV  
 - **So that** I can share with stakeholders.
 
 **Acceptance Criteria**
 - Export button on Traceability page.  
 - CSV includes story, tests, latest result, defect counts, assignees.  
 - Reuses report-friendly headers.
 
 **Priority:** P2  
 **Story Points:** 2  
 **Status:** Planned
 
 ---
 
 ### 8.6 Defect Link Conventions
 - **As a** QA lead  
 - **I want** a consistent convention for linking defects to stories/test cases  
 - **So that** associations are reliable in the matrix.
 
 **Acceptance Criteria**
 - Defect creation flow adds a YAML block with `story_id` and optional `test_case`.  
 - Existing defects can be edited to include this block.  
 - Parser added in the matrix API.
 
 **Priority:** P2  
 **Story Points:** 3  
 **Status:** Planned
 
 ---
 
 ### 8.7 Caching & Rate Limits
 - **As an** engineer  
 - **I want** to cache the matrix briefly  
 - **So that** we avoid rate limits and speed up the UI.
 
 **Acceptance Criteria**
 - In-memory cache for matrix (60s) with `?nocache=1` override.  
 - Batched GitHub requests for all upstream calls.  
 - Documented in README.
 
 **Priority:** P2  
 **Story Points:** 2  
 **Status:** Planned
 
 ---
 
 ### 8.8 Drill-down Panel (Optional)
 - **As a** tester  
 - **I want** a side panel to view full traceability for a single story  
 - **So that** I can inspect details without leaving the matrix.
 
 **Acceptance Criteria**
 - Clicking a story opens a panel with tests, latest runs, and defects.  
 - Quick links to open items.  
 - Keyboard accessible.
 
 **Priority:** P3  
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
 | Traceability & Matrix | 8 | 29 | P1–P3 |
 | **Total** | 24 stories | **102 points** | — |
