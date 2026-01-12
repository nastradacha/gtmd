"use client";

import { useCallback, useEffect, useState } from "react";
import { GitHubIssue } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import UserSelector from "@/components/UserSelector";

export default function StoriesPage() {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [filteredIssues, setFilteredIssues] = useState<GitHubIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [assignUser, setAssignUser] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editLabels, setEditLabels] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState<"all" | "open" | "closed">("all");
  const [labelFilter, setLabelFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [mobileBoardTab, setMobileBoardTab] = useState<"backlog" | "inProgress" | "done">("backlog");

  const fetchIssues = useCallback(fetchIssuesImpl, [stateFilter]);
  const applyFilters = useCallback(applyFiltersImpl, [issues, labelFilter, searchTerm, assignedOnly, currentUser]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    // fetch current user login for 'Assigned to me' filter
    fetch("/api/github/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((u) => setCurrentUser(u?.login || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedIssue) {
      setEditTitle(selectedIssue.title);
      setEditBody(selectedIssue.body || "");
      setEditLabels(selectedIssue.labels.map((l) => l.name).join(", "));
      setStatusMessage(null);
      setEditing(false);
      setAssignUser("");
    }
  }, [selectedIssue]);

  async function fetchIssuesImpl() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ state: stateFilter, includeProjectStatus: "1" });
      const res = await fetch(`/api/github/issues?${params}`);
      if (!res.ok) throw new Error("Failed to fetch issues");
      const data = await res.json();
      // Filter out pull requests (they also appear in issues endpoint)
      const issuesOnly = (Array.isArray(data) ? data : []).filter((item) => {
        if (!item || typeof item !== "object") return false;
        return !("pull_request" in (item as Record<string, unknown>));
      }) as GitHubIssue[];
      setIssues(issuesOnly);
      setFilteredIssues(issuesOnly);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch issues");
    } finally {
      setLoading(false);
    }
  }

  function applyFiltersImpl() {
    let filtered = [...issues];

    if (labelFilter) {
      filtered = filtered.filter((issue) =>
        issue.labels.some((label) =>
          label.name.toLowerCase().includes(labelFilter.toLowerCase())
        )
      );
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (issue) =>
          issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          issue.number.toString().includes(searchTerm)
      );
    }

    if (assignedOnly && currentUser) {
      filtered = filtered.filter((issue) =>
        issue.assignees?.some((a) => a.login.toLowerCase() === currentUser.toLowerCase())
      );
    }

    setFilteredIssues(filtered);
  }

  async function assign(to: "me" | "clear" | "user") {
    if (!selectedIssue) return;
    try {
      setActionLoading(true);
      setStatusMessage(null);
      const payload: { issue_number: number; me?: boolean; clear?: boolean; assignees?: string[] } = {
        issue_number: selectedIssue.number,
      };
      if (to === "me") payload.me = true;
      if (to === "clear") payload.clear = true;
      if (to === "user") payload.assignees = assignUser ? [assignUser] : [];
      const res = await fetch("/api/github/issues/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatusMessage("Assignment updated.");
      await fetchIssues();
    } catch (e: unknown) {
      setStatusMessage(e instanceof Error ? e.message : "Failed to update assignment");
    } finally {
      setActionLoading(false);
    }
  }

  async function updateIssue() {
    if (!selectedIssue) return;
    try {
      setActionLoading(true);
      setStatusMessage(null);
      const labels = editLabels
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/github/issues/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_number: selectedIssue.number,
          title: editTitle,
          body: editBody,
          labels,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatusMessage("Issue updated.");
      setEditing(false);
      await fetchIssues();
    } catch (e: unknown) {
      setStatusMessage(e instanceof Error ? e.message : "Failed to update issue");
    } finally {
      setActionLoading(false);
    }
  }

  function groupByStatus(issues: GitHubIssue[]) {
    const backlog: GitHubIssue[] = [];
    const inProgress: GitHubIssue[] = [];
    const done: GitHubIssue[] = [];

    const inProgressProjectStatuses = new Set(["in progress", "in review", "failed"]);

    issues.forEach((issue) => {
      if (issue.state === "closed") {
        done.push(issue);
      } else {
        const projectStatus = (issue.gtmd_project_status || "").toLowerCase().trim();
        if (projectStatus) {
          if (inProgressProjectStatuses.has(projectStatus)) {
            inProgress.push(issue);
          } else {
            backlog.push(issue);
          }
          return;
        }

        const labels = issue.labels.map((l) => l.name.toLowerCase());
        if (labels.includes("in progress") || labels.includes("in-progress")) {
          inProgress.push(issue);
        } else {
          backlog.push(issue);
        }
      }
    });

    return { backlog, inProgress, done };
  }

  const { backlog, inProgress, done } = groupByStatus(filteredIssues);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading stories...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">User Stories</h1>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 mb-4">
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as "all" | "open" | "closed")}
              className="w-full sm:w-auto border rounded px-3 py-2"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </div>

          <div className="w-full sm:w-64">
            <label className="block text-sm font-medium mb-1">Label Filter</label>
            <input
              type="text"
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              placeholder="e.g., bug, feature"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div className="w-full sm:w-64">
            <label className="block text-sm font-medium mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Title or #number"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div className="w-full sm:w-auto flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignedOnly}
                onChange={(e) => setAssignedOnly(e.target.checked)}
              />
              Assigned to me
            </label>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          Showing {filteredIssues.length} of {issues.length} stories
        </div>
      </div>

      {/* Kanban Board */}
      <div className="md:hidden mb-4">
        <div className="grid grid-cols-3 rounded-lg border bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setMobileBoardTab("backlog")}
            className={`px-3 py-2 text-sm font-medium border-r ${
              mobileBoardTab === "backlog" ? "bg-gray-900 text-white" : "bg-white text-gray-700"
            }`}
          >
            Backlog ({backlog.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileBoardTab("inProgress")}
            className={`px-3 py-2 text-sm font-medium border-r ${
              mobileBoardTab === "inProgress" ? "bg-blue-600 text-white" : "bg-white text-gray-700"
            }`}
          >
            In Progress ({inProgress.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileBoardTab("done")}
            className={`px-3 py-2 text-sm font-medium ${
              mobileBoardTab === "done" ? "bg-green-600 text-white" : "bg-white text-gray-700"
            }`}
          >
            Done ({done.length})
          </button>
        </div>
      </div>

      <div className="md:hidden">
        {mobileBoardTab === "backlog" && (
          <IssuesColumn
            title="Backlog"
            count={backlog.length}
            variant="backlog"
            issues={backlog}
            onIssueClick={(issue) => setSelectedIssue(issue)}
          />
        )}
        {mobileBoardTab === "inProgress" && (
          <IssuesColumn
            title="In Progress"
            count={inProgress.length}
            variant="inProgress"
            issues={inProgress}
            onIssueClick={(issue) => setSelectedIssue(issue)}
          />
        )}
        {mobileBoardTab === "done" && (
          <IssuesColumn
            title="Done"
            count={done.length}
            variant="done"
            issues={done}
            onIssueClick={(issue) => setSelectedIssue(issue)}
          />
        )}
      </div>

      <div className="hidden md:grid md:grid-cols-3 gap-4">
        <IssuesColumn
          title="Backlog"
          count={backlog.length}
          variant="backlog"
          issues={backlog}
          onIssueClick={(issue) => setSelectedIssue(issue)}
        />
        <IssuesColumn
          title="In Progress"
          count={inProgress.length}
          variant="inProgress"
          issues={inProgress}
          onIssueClick={(issue) => setSelectedIssue(issue)}
        />
        <IssuesColumn
          title="Done"
          count={done.length}
          variant="done"
          issues={done}
          onIssueClick={(issue) => setSelectedIssue(issue)}
        />
      </div>

      {/* Story Detail Modal */}
      {selectedIssue && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 z-50"
          onClick={() => setSelectedIssue(null)}
        >
          <div
            className="bg-white w-full h-full sm:h-auto rounded-none sm:rounded-lg p-4 sm:p-6 sm:max-w-2xl sm:max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    selectedIssue.state === 'open' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {selectedIssue.state.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">#{selectedIssue.number}</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedIssue.title}</h2>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">Created by</span> @{selectedIssue.user.login}
                  </div>
                  {selectedIssue.assignees && selectedIssue.assignees.length > 0 && (
                    <div>
                      <span className="font-medium">Assigned to</span> {selectedIssue.assignees.map(a => `@${a.login}`).join(', ')}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedIssue(null)}
                className="p-2 text-gray-400 hover:text-gray-600 text-3xl leading-none ml-2"
              >
                ×
              </button>
            </div>

            {/* Metadata Bar */}
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg p-4 mb-6 border border-gray-200">
              <div className="flex flex-wrap gap-4">
                {selectedIssue.labels.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Labels</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedIssue.labels.map((label) => (
                        <span
                          key={label.id}
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `#${label.color}`,
                            color: parseInt(label.color, 16) > 0xffffff / 2 ? "#000" : "#fff",
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedIssue.milestone && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Milestone</div>
                    <div className="text-sm text-gray-800 font-medium">{selectedIssue.milestone.title}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Created</div>
                  <div className="text-xs text-gray-700">{new Date(selectedIssue.created_at).toLocaleDateString()}</div>
                </div>
                {selectedIssue.updated_at && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Last Updated</div>
                    <div className="text-xs text-gray-700">{new Date(selectedIssue.updated_at).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-lg border p-6 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Description</h3>
              <div className="prose prose-sm max-w-none">
                {selectedIssue.body ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-gray-900 mb-3 pb-2 border-b" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-semibold text-gray-800 mb-2 mt-4" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-medium text-gray-700 mb-2 mt-3" {...props} />,
                      p: ({node, ...props}) => <p className="text-gray-700 mb-3 leading-relaxed" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1.5 mb-3 text-gray-700" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1.5 mb-3 text-gray-700" {...props} />,
                      li: ({node, ...props}) => <li className="ml-2" {...props} />,
                      code: ({ node: _node, className, children, ...props }) => {
                        const isBlock = typeof className === "string" && className.trim().length > 0;
                        return isBlock ? (
                          <code
                            className="block bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2"
                            {...props}
                          >
                            {children}
                          </code>
                        ) : (
                          <code
                            className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 my-3" {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-600 hover:underline" {...props} />,
                    }}
                  >
                    {selectedIssue.body}
                  </ReactMarkdown>
                ) : (
                  <p className="text-gray-500 italic">No description provided</p>
                )}
              </div>
            </div>

            {/* Assignment Controls */}
            <div className="mt-4 pt-4 border-t space-y-3">
              {statusMessage && (
                <div className="text-sm text-gray-700">{statusMessage}</div>
              )}
              <div>
                <div className="text-sm font-medium mb-2">Assignment</div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <UserSelector
                    value={assignUser}
                    onChange={setAssignUser}
                    placeholder="Type to search collaborators..."
                    className="border rounded px-3 py-2 text-sm w-full"
                  />
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => assign("me")}
                      className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                      disabled={actionLoading}
                    >
                      Assign to me
                    </button>
                    <button
                      onClick={() => assign("user")}
                      className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                      disabled={actionLoading || !assignUser}
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => assign("clear")}
                      className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                      disabled={actionLoading}
                    >
                      Unassign
                    </button>
                  </div>
                </div>
              </div>

              {/* Edit Issue */}
              <div className="pt-3 border-t">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm font-medium">Edit Issue</div>
                  {!editing ? (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(false)}
                        className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                        disabled={actionLoading}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={updateIssue}
                        className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm h-32"
                    />
                    <input
                      type="text"
                      value={editLabels}
                      onChange={(e) => setEditLabels(e.target.value)}
                      placeholder="labels, comma, separated"
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}
              </div>

              <div className="pt-3 border-t">
                <a
                  href={selectedIssue.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View on GitHub →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IssuesColumn({
  title,
  count,
  variant,
  issues,
  onIssueClick,
}: {
  title: string;
  count: number;
  variant: "backlog" | "inProgress" | "done";
  issues: GitHubIssue[];
  onIssueClick: (issue: GitHubIssue) => void;
}) {
  const bg =
    variant === "inProgress"
      ? "bg-blue-50"
      : variant === "done"
        ? "bg-green-50"
        : "bg-gray-50";

  return (
    <div className={`${bg} rounded-lg p-4`}>
      <h2 className="font-semibold text-lg mb-3">
        {title} <span className="text-gray-500">({count})</span>
      </h2>
      <div className="space-y-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} onClick={() => onIssueClick(issue)} />
        ))}
      </div>
    </div>
  );
}

function IssueCard({ issue, onClick }: { issue: GitHubIssue; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-medium text-sm">#{issue.number}</div>
        {issue.assignees && issue.assignees.length > 0 && (
          <div className="flex gap-1">
            {issue.assignees.slice(0, 2).map((assignee) => (
              <span
                key={assignee.login}
                className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300"
              >
                @{assignee.login}
              </span>
            ))}
            {issue.assignees.length > 2 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                +{issue.assignees.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="text-sm mb-2">{issue.title}</div>
      <div className="flex gap-1 flex-wrap">
        {issue.labels.slice(0, 3).map((label) => (
          <span
            key={label.id}
            className="px-2 py-0.5 rounded text-xs"
            style={{
              backgroundColor: `#${label.color}`,
              color: parseInt(label.color, 16) > 0xffffff / 2 ? "#000" : "#fff",
            }}
          >
            {label.name}
          </span>
        ))}
      </div>
    </div>
  );
}
