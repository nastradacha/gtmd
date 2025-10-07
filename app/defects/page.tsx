"use client";

import { useEffect, useState } from "react";
import { GitHubIssue, DefectFormData } from "@/lib/types";

export default function DefectsPage() {
  const [defects, setDefects] = useState<GitHubIssue[]>([]);
  const [filteredDefects, setFilteredDefects] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<GitHubIssue | null>(null);
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
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");

  // Form state
  const [formData, setFormData] = useState<DefectFormData>({
    title: "",
    description: "",
    severity: "Medium",
    priority: "P2",
    storyId: "",
    testCaseId: "",
  });

  useEffect(() => {
    fetchDefects();
  }, [statusFilter]);

  useEffect(() => {
    applyFilters();
  }, [defects, severityFilter, assignedOnly, currentUser]);

  useEffect(() => {
    // fetch current user login for 'Assigned to me' filter
    fetch("/api/github/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((u) => setCurrentUser(u?.login || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDefect) {
      setEditTitle(selectedDefect.title);
      setEditBody(selectedDefect.body || "");
      setEditLabels(selectedDefect.labels.map((l) => l.name).join(", "));
      setStatusMessage(null);
      setEditing(false);
      setAssignUser("");
    }
  }, [selectedDefect]);

  async function fetchDefects() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        state: statusFilter,
        labels: "bug",
      });
      const res = await fetch(`/api/github/issues?${params}`);
      if (!res.ok) throw new Error("Failed to fetch defects");
      const data = await res.json();
      setDefects(data);
      setFilteredDefects(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...defects];

    if (severityFilter) {
      filtered = filtered.filter((defect) =>
        defect.labels.some((label) =>
          label.name.toLowerCase().includes(severityFilter.toLowerCase())
        )
      );
    }

    if (assignedOnly && currentUser) {
      filtered = filtered.filter((defect) =>
        defect.assignees?.some((a) => a.login.toLowerCase() === currentUser.toLowerCase())
      );
    }

    setFilteredDefects(filtered);
  }

  async function assign(to: "me" | "clear" | "user") {
    if (!selectedDefect) return;
    try {
      setActionLoading(true);
      setStatusMessage(null);
      const payload: any = { issue_number: selectedDefect.number };
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
      await fetchDefects();
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to update assignment");
    } finally {
      setActionLoading(false);
    }
  }

  async function updateIssue() {
    if (!selectedDefect) return;
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
          issue_number: selectedDefect.number,
          title: editTitle,
          body: editBody,
          labels,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatusMessage("Defect updated.");
      setEditing(false);
      await fetchDefects();
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to update defect");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body = `## Defect Details

**Severity**: ${formData.severity}
**Priority**: ${formData.priority}
${formData.storyId ? `**Story ID**: #${formData.storyId}` : ""}
${formData.testCaseId ? `**Test Case**: ${formData.testCaseId}` : ""}

## Description
${formData.description}

---
*Created via GTMD Dashboard*`;

      const labels = ["bug", formData.severity.toLowerCase()];

      const res = await fetch("/api/github/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          body,
          labels,
        }),
      });

      if (!res.ok) throw new Error("Failed to create defect");

      // Reset form and refresh list
      setFormData({
        title: "",
        description: "",
        severity: "Medium",
        priority: "P2",
        storyId: "",
        testCaseId: "",
      });
      setShowForm(false);
      fetchDefects();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading defects...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Defects</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            {showForm ? "Cancel" : "Log Defect"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Defect Form */}
        {showForm && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Log New Defect</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Brief description of the defect"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description *</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded px-3 py-2 h-32"
                  placeholder="Detailed description, steps to reproduce, etc."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Severity *</label>
                  <select
                    value={formData.severity}
                    onChange={(e) =>
                      setFormData({ ...formData, severity: e.target.value as any })
                    }
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Priority *</label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value as any })
                    }
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Story ID</label>
                  <input
                    type="text"
                    value={formData.storyId}
                    onChange={(e) => setFormData({ ...formData, storyId: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., 123"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Test Case ID</label>
                  <input
                    type="text"
                    value={formData.testCaseId}
                    onChange={(e) => setFormData({ ...formData, testCaseId: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., TC-001"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Defect"}
              </button>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="border rounded px-3 py-2"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
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
          Showing {filteredDefects.length} of {defects.length} defects
        </div>
      </div>

      {/* Defects List */}
      <div className="space-y-3">
        {filteredDefects.map((defect) => (
          <DefectCard key={defect.id} defect={defect} onClick={() => setSelectedDefect(defect)} />
        ))}

        {filteredDefects.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No defects found. {statusFilter === "open" && "Great job! 🎉"}
          </div>
        )}
      </div>

      {/* Defect Modal */}
      {selectedDefect && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedDefect(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold">{selectedDefect.title}</h2>
                <div className="text-sm text-gray-600 mt-1">
                  #{selectedDefect.number} • Opened by {selectedDefect.user.login}
                </div>
              </div>
              <button
                onClick={() => setSelectedDefect(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              {selectedDefect.labels.map((label) => (
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
              <p className="whitespace-pre-wrap">{selectedDefect.body || "No description"}</p>
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

              {/* Edit Defect */}
              <div className="pt-3 border-t">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm font-medium">Edit Defect</div>
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

                <div className="pt-3 border-t">
                  <a
                    href={selectedDefect.html_url}
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
        </div>
      )}
    </div>
  );
}

function DefectCard({ defect, onClick }: { defect: GitHubIssue; onClick: () => void }) {
  const severityLabel = defect.labels.find((l) =>
    ["critical", "high", "medium", "low"].includes(l.name.toLowerCase())
  );

  const severityColors: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border-red-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-blue-100 text-blue-800 border-blue-300",
  };

  const severity = severityLabel?.name.toLowerCase() || "medium";
  const colorClass = severityColors[severity] || severityColors.medium;

  return (
    <div className={`border rounded-lg p-4 ${colorClass} cursor-pointer`} onClick={onClick}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-sm">#{defect.number}</span>
            <span className="font-semibold">{defect.title}</span>
            {defect.state === "closed" && (
              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                Closed
              </span>
            )}
          </div>

          <div className="text-sm text-gray-700 mb-2">
            {defect.body?.substring(0, 200)}
            {defect.body && defect.body.length > 200 && "..."}
          </div>

          <div className="flex gap-2 flex-wrap">
            {defect.labels.map((label) => (
              <span
                key={label.id}
                className="px-2 py-0.5 rounded text-xs font-medium"
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

        <a
          href={defect.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline ml-4"
        >
          View →
        </a>
      </div>
    </div>
  );
}
