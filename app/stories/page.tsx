"use client";

import { useEffect, useState } from "react";
import { GitHubIssue } from "@/lib/types";

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
  const [stateFilter, setStateFilter] = useState<"all" | "open" | "closed">("open");
  const [labelFilter, setLabelFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchIssues();
  }, [stateFilter]);

  useEffect(() => {
    applyFilters();
  }, [issues, labelFilter, searchTerm, assignedOnly, currentUser]);

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

  async function fetchIssues() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ state: stateFilter });
      const res = await fetch(`/api/github/issues?${params}`);
      if (!res.ok) throw new Error("Failed to fetch issues");
      const data = await res.json();
      // Filter out pull requests (they also appear in issues endpoint)
      const issuesOnly = data.filter((item: any) => !item.pull_request);
      setIssues(issuesOnly);
      setFilteredIssues(issuesOnly);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
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
      const payload: any = { issue_number: selectedIssue.number };
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
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to update assignment");
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
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to update issue");
    } finally {
      setActionLoading(false);
    }
  }

  function groupByStatus(issues: GitHubIssue[]) {
    const backlog: GitHubIssue[] = [];
    const inProgress: GitHubIssue[] = [];
    const done: GitHubIssue[] = [];

    issues.forEach((issue) => {
      if (issue.state === "closed") {
        done.push(issue);
      } else {
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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">User Stories</h1>

        {/* Filters */}
        <div className="flex gap-4 mb-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as any)}
              className="border rounded px-3 py-2"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Label Filter</label>
            <input
              type="text"
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              placeholder="e.g., bug, feature"
              className="border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Title or #number"
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex items-end">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Backlog */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h2 className="font-semibold text-lg mb-3">
            Backlog <span className="text-gray-500">({backlog.length})</span>
          </h2>
          <div className="space-y-2">
            {backlog.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onClick={() => setSelectedIssue(issue)}
              />
            ))}
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h2 className="font-semibold text-lg mb-3">
            In Progress <span className="text-gray-500">({inProgress.length})</span>
          </h2>
          <div className="space-y-2">
            {inProgress.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onClick={() => setSelectedIssue(issue)}
              />
            ))}
          </div>
        </div>

        {/* Done */}
        <div className="bg-green-50 rounded-lg p-4">
          <h2 className="font-semibold text-lg mb-3">
            Done <span className="text-gray-500">({done.length})</span>
          </h2>
          <div className="space-y-2">
            {done.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onClick={() => setSelectedIssue(issue)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Story Detail Modal */}
      {selectedIssue && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedIssue(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold">{selectedIssue.title}</h2>
                <div className="text-sm text-gray-600 mt-1">
                  #{selectedIssue.number} • Opened by {selectedIssue.user.login}
                </div>
              </div>
              <button
                onClick={() => setSelectedIssue(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex gap-2 mb-4">
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

            <div className="prose max-w-none mb-4">
              <p className="whitespace-pre-wrap">{selectedIssue.body || "No description"}</p>
            </div>

            <div className="flex gap-4 text-sm text-gray-600">
              <div>
                <strong>State:</strong> {selectedIssue.state}
              </div>
              {selectedIssue.milestone && (
                <div>
                  <strong>Milestone:</strong> {selectedIssue.milestone.title}
                </div>
              )}
            </div>

            {/* Assignment Controls */}
            <div className="mt-4 pt-4 border-t space-y-3">
              {statusMessage && (
                <div className="text-sm text-gray-700">{statusMessage}</div>
              )}
              <div>
                <div className="text-sm font-medium mb-2">Assignment</div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    type="text"
                    value={assignUser}
                    onChange={(e) => setAssignUser(e.target.value)}
                    placeholder="github username"
                    className="border rounded px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
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

function IssueCard({ issue, onClick }: { issue: GitHubIssue; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="font-medium text-sm mb-1">#{issue.number}</div>
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
