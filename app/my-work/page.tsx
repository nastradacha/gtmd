"use client";

import { useEffect, useMemo, useState } from "react";
import { GitHubIssue } from "@/lib/types";

export default function MyWorkPage() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stories, setStories] = useState<GitHubIssue[]>([]);
  const [defects, setDefects] = useState<GitHubIssue[]>([]);

  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editLabels, setEditLabels] = useState("");
  const [assignUser, setAssignUser] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/github/me", { cache: "no-store" });
        if (!meRes.ok) throw new Error("Failed to load current user");
        const me = await meRes.json();
        const login = me?.login;
        setCurrentUser(login || null);
        if (!login) throw new Error("No GitHub login found");

        // Load assigned items
        const [storiesRes, defectsRes] = await Promise.all([
          fetch(`/api/github/issues?state=open&assignee=${encodeURIComponent(login)}`),
          fetch(`/api/github/issues?state=open&labels=bug&assignee=${encodeURIComponent(login)}`),
        ]);
        if (!storiesRes.ok) throw new Error(await storiesRes.text());
        if (!defectsRes.ok) throw new Error(await defectsRes.text());
        const storiesData = await storiesRes.json();
        const defectsData = await defectsRes.json();
        // Filter out PRs
        setStories(storiesData.filter((i: any) => !i.pull_request));
        setDefects(defectsData.filter((i: any) => !i.pull_request));
      } catch (e: any) {
        setError(e.message || "Failed to load 'My Work'");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function startEdit(issue: GitHubIssue) {
    setEditId(issue.number);
    setEditTitle(issue.title);
    setEditBody(issue.body || "");
    setEditLabels(issue.labels.map((l) => l.name).join(", "));
    setStatusMessage(null);
  }

  async function refreshLists() {
    if (!currentUser) return;
    try {
      const [storiesRes, defectsRes] = await Promise.all([
        fetch(`/api/github/issues?state=open&assignee=${encodeURIComponent(currentUser)}`),
        fetch(`/api/github/issues?state=open&labels=bug&assignee=${encodeURIComponent(currentUser)}`),
      ]);
      if (storiesRes.ok) setStories((await storiesRes.json()).filter((i: any) => !i.pull_request));
      if (defectsRes.ok) setDefects((await defectsRes.json()).filter((i: any) => !i.pull_request));
    } catch {}
  }

  async function assign(issueNumber: number, kind: "me" | "user" | "clear") {
    try {
      setActionLoading(true);
      setStatusMessage(null);
      const payload: any = { issue_number: issueNumber };
      if (kind === "me") payload.me = true;
      if (kind === "user") payload.assignees = assignUser ? [assignUser] : [];
      if (kind === "clear") payload.clear = true;
      const res = await fetch("/api/github/issues/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatusMessage("Assignment updated.");
      await refreshLists();
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to assign");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveIssue(issueNumber: number) {
    try {
      setActionLoading(true);
      const labels = editLabels
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/github/issues/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_number: issueNumber, title: editTitle, body: editBody, labels }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatusMessage("Issue updated.");
      setEditId(null);
      await refreshLists();
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to update issue");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div>Loading My Work...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">My Work</h1>
        <div className="text-gray-600 text-sm mt-1">Items assigned to @{currentUser}</div>
      </div>

      {statusMessage && (
        <div className="mb-4 text-sm text-gray-700">{statusMessage}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Stories */}
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold text-lg mb-3">Stories ({stories.length})</h2>
          <div className="space-y-2">
            {stories.map((issue) => (
              <div key={issue.id} className="border rounded p-3 bg-white">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-sm">#{issue.number} • {issue.title}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      {issue.labels.map((l) => (
                        <span key={l.id} className="inline-block mr-1 px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: `#${l.color}`, color: parseInt(l.color, 16) > 0xffffff / 2 ? "#000" : "#fff" }}>{l.name}</span>
                      ))}
                    </div>
                  </div>
                  <a href={issue.html_url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm hover:underline ml-3">Open →</a>
                </div>

                {/* quick actions */}
                <div className="mt-2 flex flex-wrap gap-2 items-center text-sm">
                  <button onClick={() => assign(issue.number, "me")} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading}>Assign to me</button>
                  <button onClick={() => assign(issue.number, "clear")} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading}>Unassign</button>
                  <div className="flex items-center gap-2">
                    <input value={assignUser} onChange={(e) => setAssignUser(e.target.value)} placeholder="assign user" className="border rounded px-2 py-1 text-sm" />
                    <button onClick={() => assign(issue.number, "user")} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading || !assignUser}>Assign</button>
                  </div>
                  {editId !== issue.number ? (
                    <button onClick={() => startEdit(issue)} className="px-2 py-1 border rounded hover:bg-gray-50">Edit</button>
                  ) : (
                    <>
                      <button onClick={() => setEditId(null)} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading}>Cancel</button>
                      <button onClick={() => saveIssue(issue.number)} className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={actionLoading}>{actionLoading ? "Saving..." : "Save"}</button>
                    </>
                  )}
                </div>

                {editId === issue.number && (
                  <div className="mt-3 space-y-2">
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="w-full border rounded px-3 py-2 text-sm h-24" />
                    <input value={editLabels} onChange={(e) => setEditLabels(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="labels, comma, separated" />
                  </div>
                )}
              </div>
            ))}

            {stories.length === 0 && <div className="text-gray-500 text-sm">No stories assigned.</div>}
          </div>
        </section>

        {/* My Defects */}
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold text-lg mb-3">Defects ({defects.length})</h2>
          <div className="space-y-2">
            {defects.map((issue) => (
              <div key={issue.id} className="border rounded p-3 bg-white">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-sm">#{issue.number} • {issue.title}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      {issue.labels.map((l) => (
                        <span key={l.id} className="inline-block mr-1 px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: `#${l.color}`, color: parseInt(l.color, 16) > 0xffffff / 2 ? "#000" : "#fff" }}>{l.name}</span>
                      ))}
                    </div>
                  </div>
                  <a href={issue.html_url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm hover:underline ml-3">Open →</a>
                </div>

                {/* quick actions */}
                <div className="mt-2 flex flex-wrap gap-2 items-center text-sm">
                  <button onClick={() => assign(issue.number, "me")} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading}>Assign to me</button>
                  <button onClick={() => assign(issue.number, "clear")} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading}>Unassign</button>
                  <div className="flex items-center gap-2">
                    <input value={assignUser} onChange={(e) => setAssignUser(e.target.value)} placeholder="assign user" className="border rounded px-2 py-1 text-sm" />
                    <button onClick={() => assign(issue.number, "user")} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading || !assignUser}>Assign</button>
                  </div>
                  {editId !== issue.number ? (
                    <button onClick={() => startEdit(issue)} className="px-2 py-1 border rounded hover:bg-gray-50">Edit</button>
                  ) : (
                    <>
                      <button onClick={() => setEditId(null)} className="px-2 py-1 border rounded hover:bg-gray-50" disabled={actionLoading}>Cancel</button>
                      <button onClick={() => saveIssue(issue.number)} className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={actionLoading}>{actionLoading ? "Saving..." : "Save"}</button>
                    </>
                  )}
                </div>

                {editId === issue.number && (
                  <div className="mt-3 space-y-2">
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="w-full border rounded px-3 py-2 text-sm h-24" />
                    <input value={editLabels} onChange={(e) => setEditLabels(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="labels, comma, separated" />
                  </div>
                )}
              </div>
            ))}

            {defects.length === 0 && <div className="text-gray-500 text-sm">No defects assigned.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
