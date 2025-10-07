"use client";

import { useEffect, useState } from "react";
import { TestCase, TestCaseFormData } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function TestCasesPage() {
  const [files, setFiles] = useState<TestCase[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [latestRun, setLatestRun] = useState<any | null>(null);
  const [runHistory, setRunHistory] = useState<any[]>([]);
  const [lastPrNumber, setLastPrNumber] = useState<number | null>(null);
  const [lastPrUrl, setLastPrUrl] = useState<string | null>(null);
  const [lastPrState, setLastPrState] = useState<string | null>(null);
  const [lastPrMergedAt, setLastPrMergedAt] = useState<string | null>(null);
  const [latestByPath, setLatestByPath] = useState<Record<string, { result: string; executed_at: string }>>({});
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [selectedPending, setSelectedPending] = useState<boolean>(false);
  const [selectedPrUrl, setSelectedPrUrl] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string>("");

  const [formData, setFormData] = useState<TestCaseFormData>({
    title: "",
    storyId: "",
    steps: "",
    expected: "",
    priority: "P2",
    suite: "General",
    folder: "manual/General",
  });

  useEffect(() => {
    fetchTestCases();
  }, []);

  // Load latest run status for all files in list
  useEffect(() => {
    (async () => {
      try {
        const entries = await Promise.all(
          files.map(async (f) => {
            try {
              const r = await fetch(`/api/github/testcases/runs?path=${encodeURIComponent(f.path)}&limit=1`);
              if (!r.ok) return [f.path, null] as const;
              const json = await r.json();
              return [f.path, json.latest || null] as const;
            } catch {
              return [f.path, null] as const;
            }
          })
        );
        const map: Record<string, any> = {};
        for (const [p, v] of entries) {
          if (v) map[p] = { result: v.result, executed_at: v.executed_at };
        }
        setLatestByPath(map);
      } catch {
        // ignore
      }
    })();
  }, [files]);

  // Poll PR status after operations
  useEffect(() => {
    if (!lastPrNumber) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const prRes = await fetch(`/api/github/pr?number=${lastPrNumber}`);
        if (!prRes.ok) return;
        const pr = await prRes.json();
        if (!active) return;
        setLastPrState(pr.state || null);
        setLastPrMergedAt(pr.merged_at || null);
        if (pr.merged_at || pr.state === "closed") {
          clearInterval(interval);
        }
      } catch {}
    }, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [lastPrNumber]);

  async function fetchTestCases() {
    try {
      const res = await fetch("/api/github/testcases");
      if (!res.ok) throw new Error("Failed to fetch test cases");
      const data = await res.json();
      setFiles(data);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function openFile(file: TestCase) {
    setContent(null);
    setSelectedFile(file.path);
    setSelectedRef(file.ref || null);
    setSelectedPending(!!file.pending);
    setSelectedPrUrl(file.prUrl || null);
    setError(null);

    try {
      const res = await fetch(
        "/api/github/testcases?path=" +
          encodeURIComponent(file.path) +
          (file.ref ? "&ref=" + encodeURIComponent(file.ref) : "")
      );
      if (!res.ok) throw new Error("Failed to fetch file content");
      const data = await res.json();
      const decoded = atob(data.content);
      setContent(decoded);
      setEditText(decoded);
      setEditing(false);
      // Load run history
      try {
        const runsRes = await fetch("/api/github/testcases/runs?path=" + encodeURIComponent(file.path));
        if (runsRes.ok) {
          const runs = await runsRes.json();
          setLatestRun(runs.latest || null);
          setRunHistory(runs.runs || []);
        } else {
          setLatestRun(null);
          setRunHistory([]);
        }
      } catch {
        setLatestRun(null);
        setRunHistory([]);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function saveEdit() {
    if (!selectedFile) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/github/testcases/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile, content: editText, ref: selectedRef || undefined }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save changes");
      }
      setContent(editText);
      setEditing(false);
      setSuccessMessage("Test case updated successfully.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function recordResult(result: "pass" | "fail") {
    if (!selectedFile) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/github/testcases/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile, result, notes }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to record ${result}`);
      }
      const data = await res.json();
      if (data.noop) {
        setSuccessMessage(data.message || `No change. Latest run already ${result.toUpperCase()}.`);
      } else if (data.pr) {
        setSuccessMessage(`Recorded ${result.toUpperCase()}. PR #${data.pr.number} opened.`);
        setLastPrNumber(data.pr.number);
        setLastPrUrl(data.pr.url);
        // Fetch PR status
        try {
          const prRes = await fetch(`/api/github/pr?number=${data.pr.number}`);
          if (prRes.ok) {
            const pr = await prRes.json();
            setLastPrState(pr.state || null);
          }
        } catch {}
      }
      setNotes("");
      // refresh runs
      if (selectedFile) {
        await openFile({ path: selectedFile, name: selectedFile.split("/").pop() || selectedFile, url: "", ref: selectedRef || undefined, pending: selectedPending, prUrl: selectedPrUrl || undefined } as any);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/github/testcases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create test case");
      }

      const data = await res.json();
      setSuccessMessage(`Test case created! PR #${data.pr.number} opened for review.`);
      // Surface PR status
      try {
        setLastPrNumber(data.pr.number);
        setLastPrUrl(data.pr.url);
        const prRes = await fetch(`/api/github/pr?number=${data.pr.number}`);
        if (prRes.ok) {
          const pr = await prRes.json();
          setLastPrState(pr.state || null);
          setLastPrMergedAt(pr.merged_at || null);
        }
      } catch {}

      // Reset form
      setFormData({
        title: "",
        storyId: "",
        steps: "",
        expected: "",
        priority: "P2",
        suite: "General",
        folder: "manual/General",
      });

      setShowForm(false);
      fetchTestCases();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Test Cases</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            {showForm ? "Cancel" : "Create Test Case"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}

        {/* Create Test Case Form */}
        {showForm && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Test Case</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., Login with valid credentials"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Folder</label>
                <input
                  type="text"
                  value={formData.folder || ""}
                  onChange={(e) => setFormData({ ...formData, folder: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="manual/home-page or Regression"
                />
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {[
                    "manual/home-page",
                    "manual/listing-detail",
                    "manual/messages",
                    "manual/General",
                    "manual/settings/Profile",
                    "Regression",
                  ].map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setFormData({ ...formData, folder: p })}
                      className="px-2 py-1 border rounded hover:bg-gray-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

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
                <label className="block text-sm font-medium mb-1">Test Steps *</label>
                <textarea
                  required
                  value={formData.steps}
                  onChange={(e) => setFormData({ ...formData, steps: e.target.value })}
                  className="w-full border rounded px-3 py-2 h-32"
                  placeholder="1. Navigate to login page&#10;2. Enter username&#10;3. Enter password&#10;4. Click login"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Expected Results *</label>
                <textarea
                  required
                  value={formData.expected}
                  onChange={(e) => setFormData({ ...formData, expected: e.target.value })}
                  className="w-full border rounded px-3 py-2 h-24"
                  placeholder="User should be logged in and redirected to dashboard"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value as any })
                    }
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="P1">P1 - Critical</option>
                    <option value="P2">P2 - High</option>
                    <option value="P3">P3 - Medium</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Test Suite</label>
                  <input
                    type="text"
                    value={formData.suite}
                    onChange={(e) => setFormData({ ...formData, suite: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., Authentication"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Creating PR..." : "Create Test Case"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Test Cases Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: list */}
        <div className="border rounded-lg p-4">
          <div className="flex items-end justify-between mb-2">
            <h2 className="text-lg font-semibold">Test Cases ({files.length})</h2>
            <div className="flex items-center gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Folder filter</label>
                <input
                  type="text"
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                  placeholder="e.g., manual/home-page or Regression"
                  className="border rounded px-2 py-1 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-[70vh] overflow-auto">
            {files
              .filter((f) => !folderFilter || f.path.toLowerCase().includes(`qa-testcases/${folderFilter}`.toLowerCase()))
              .map((f) => (
                <button
                  key={f.path}
                  onClick={() => openFile(f)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedFile === f.path ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm">{f.name}</div>
                    {f.pending && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                        Pending review
                      </span>
                    )}
                    {latestByPath[f.path]?.result && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          String(latestByPath[f.path].result).toLowerCase() === "pass"
                            ? "bg-green-100 text-green-800 border-green-300"
                            : "bg-red-100 text-red-800 border-red-300"
                        }`}
                      >
                        {String(latestByPath[f.path].result).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{f.path}</div>
                </button>
              ))}

            {files.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No test cases found. Create one to get started!
              </div>
            )}
          </div>
        </div>

        {/* Right: preview/edit */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{editing ? "Edit Test Case" : "Preview"}</h2>
            {selectedFile && (
              <div className="flex gap-2">
                {!editing ? (
                  <button
                    onClick={() => setEditing(true)}
                    className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
                      disabled={actionLoading}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Saving..." : "Save"}
                    </button>
                  </>
                )}
                {selectedPending && selectedPrUrl && (
                  <a
                    href={selectedPrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 text-yellow-800 border-yellow-300 bg-yellow-50"
                  >
                    Pending review →
                  </a>
                )}
              </div>
            )}
          </div>

          {content ? (
            <div className="prose prose-sm max-w-none">
              {editing ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full border rounded p-3 h-[55vh] font-mono text-sm"
                />
              ) : (
                <div className="bg-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
                    {content}
                  </ReactMarkdown>
                </div>
              )}

              {/* Execution controls */}
              {!editing && selectedFile && (
                <div className="mt-4 border-t pt-4">
                  <div className="mb-2 text-sm font-medium">Execution Result</div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes"
                      className="flex-1 border rounded px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => recordResult("pass")}
                        className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
                        disabled={actionLoading || (latestRun?.result?.toLowerCase?.() === "pass" && (notes || "").trim() === "")}
                      >
                        {actionLoading ? "Working..." : "Mark Pass"}
                      </button>
                      <button
                        onClick={() => recordResult("fail")}
                        className="px-3 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
                        disabled={actionLoading || (latestRun?.result?.toLowerCase?.() === "fail" && (notes || "").trim() === "")}
                      >
                        {actionLoading ? "Working..." : "Mark Fail"}
                      </button>
                    </div>
                  </div>

                  {/* Latest run status */}
                  <div className="mt-3 text-xs text-gray-600">
                    {latestRun ? (
                      <div>
                        <div>
                          <span className="font-medium">Latest:</span> {String(latestRun.result).toUpperCase()} by @{latestRun.executed_by} on {new Date(latestRun.executed_at).toLocaleString()}
                        </div>
                        {latestRun.notes && (
                          <div className="mt-1">Notes: {latestRun.notes}</div>
                        )}
                      </div>
                    ) : (
                      <div>No runs yet.</div>
                    )}
                  </div>

                  {/* Run history */}
                  {runHistory.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium mb-1">History</div>
                      <ul className="text-xs text-gray-600 space-y-1 max-h-40 overflow-auto">
                        {runHistory.map((r, idx) => (
                          <li key={idx}>
                            {String(r.result).toUpperCase()} • @{r.executed_by} • {new Date(r.executed_at).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* PR status */}
                  {lastPrNumber && (
                    <div className="mt-3 text-xs">
                      PR #{lastPrNumber}: {lastPrState || "created"} –
                      {" "}
                      <a className="text-blue-600 hover:underline" href={lastPrUrl || undefined} target="_blank" rel="noreferrer">
                        View
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">Select a test case to preview</div>
          )}
        </div>
      </div>
    </div>
  );
}
