"use client";

import { useEffect, useState } from "react";
import { TestCase, TestCaseFormData } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import UserSelector from "@/components/UserSelector";

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
  const [assignUser, setAssignUser] = useState<string>("");
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);

  const [formData, setFormData] = useState<TestCaseFormData>({
    title: "",
    story_id: "",
    steps: "",
    expected: "",
    priority: "P2",
    suite: "General",
    component: "",
    preconditions: "",
    data: "",
    env: "",
    folder: "manual/General",
  });

  // Pretty display name: use frontmatter title if available, else clean filename
  const displayName = (file: TestCase) => {
    if (file.title) return file.title;
    const base = file.name.replace(/\.md$/i, "");
    const noPrefix = base.replace(/^TC-\d+-/, "");
    return noPrefix.replace(/[-_]+/g, " ");
  };

  // Extract folder path only (without filename)
  const folderPath = (fullPath: string) => {
    const parts = fullPath.split("/");
    return parts.slice(0, -1).join("/");
  };

  // Parse frontmatter and body content
  const parseFrontmatter = (markdown: string) => {
    const fmMatch = markdown.match(/^---\s*\r?\n([\s\S]+?)\r?\n---\s*\r?\n([\s\S]*)$/);
    if (!fmMatch) return { metadata: {}, body: markdown };
    
    const frontmatter = fmMatch[1];
    const body = fmMatch[2];
    const metadata: Record<string, string> = {};
    
    frontmatter.split('\n').forEach(line => {
      const match = line.match(/^(\w+):\s*(?:["'](.+?)["']|(.+?))\s*$/);
      if (match) {
        const key = match[1];
        const value = match[2] || match[3] || '';
        metadata[key] = value.trim();
      }
    });
    
    return { metadata, body };
  };

  // Fetch test cases function
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

  // Fetch test cases on mount
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

  async function openFile(file: TestCase) {
    setContent(null);
    setSelectedFile(file.path);
    setSelectedRef(file.ref || null);
    setSelectedPending(!!file.pending);
    setSelectedPrUrl(file.prUrl || null);
    setSelectedTestCase(file);
    setAssignmentMessage(null);
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

  async function assignTestCase(type: "me" | "user" | "clear") {
    if (!selectedTestCase || !selectedFile) return;
    
    try {
      setActionLoading(true);
      setAssignmentMessage(null);
      
      let assignee: string | null = null;
      if (type === "me") {
        const meRes = await fetch("/api/github/me");
        if (!meRes.ok) throw new Error("Failed to fetch current user");
        const me = await meRes.json();
        assignee = me.login;
      } else if (type === "user" && assignUser.trim()) {
        assignee = assignUser.trim();
      }
      
      const res = await fetch("/api/github/testcases/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile,
          assignee: assignee,
          ref: selectedRef
        }),
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update assignment");
      }
      
      const data = await res.json();
      if (data.success) {
        setAssignmentMessage(
          assignee 
            ? `Assigned to @${assignee}. PR #${data.prNumber} opened.` 
            : `Unassigned. PR #${data.prNumber} opened.`
        );
        setAssignUser("");
        // Refresh test cases list
        await fetchTestCases();
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
        story_id: "",
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
                  value={formData.story_id}
                  onChange={(e) => setFormData({ ...formData, story_id: e.target.value })}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-sm">{displayName(f)}</div>
                    {f.assigned_to && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                        @{f.assigned_to}
                      </span>
                    )}
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
                  <div className="text-xs text-gray-500 mt-1">{folderPath(f.path)}</div>
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
            <div className="max-w-none">
              {editing ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full border rounded p-3 h-[55vh] font-mono text-sm"
                />
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const { metadata, body } = parseFrontmatter(content);
                    return (
                      <>
                        {/* Metadata Card */}
                        {Object.keys(metadata).length > 0 && (
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                            <div className="grid grid-cols-2 gap-3">
                              {metadata.title && (
                                <div className="col-span-2">
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Title</div>
                                  <div className="text-lg font-bold text-gray-800">{metadata.title}</div>
                                </div>
                              )}
                              {metadata.story_id && (
                                <div>
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Story</div>
                                  <div className="text-sm text-gray-700 font-medium">#{metadata.story_id}</div>
                                </div>
                              )}
                              {metadata.priority && (
                                <div>
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Priority</div>
                                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                    metadata.priority === 'P1' ? 'bg-red-100 text-red-800' :
                                    metadata.priority === 'P2' ? 'bg-orange-100 text-orange-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {metadata.priority}
                                  </span>
                                </div>
                              )}
                              {metadata.suite && (
                                <div>
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Suite</div>
                                  <div className="text-sm text-gray-700">{metadata.suite}</div>
                                </div>
                              )}
                              {metadata.created_by && (
                                <div>
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Created By</div>
                                  <div className="text-sm text-gray-700">@{metadata.created_by}</div>
                                </div>
                              )}
                              {metadata.created && (
                                <div className="col-span-2">
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Created</div>
                                  <div className="text-xs text-gray-600">{new Date(metadata.created).toLocaleString()}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Body Content */}
                        <div className="bg-white rounded-lg p-4 border prose prose-sm max-w-none">
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
                              code: ({node, inline, ...props}: any) => 
                                inline ? 
                                  <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props} /> :
                                  <code className="block bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2" {...props} />,
                              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 my-3" {...props} />,
                            }}
                          >
                            {body}
                          </ReactMarkdown>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Assignment controls */}
              {!editing && selectedFile && selectedTestCase && (
                <div className="mt-4 border-t pt-4">
                  <div className="mb-2 text-sm font-medium">Assignment</div>
                  {assignmentMessage && (
                    <div className="text-sm text-green-700 mb-2 bg-green-50 p-2 rounded">{assignmentMessage}</div>
                  )}
                  {selectedTestCase.assigned_to && (
                    <div className="text-sm text-gray-700 mb-2">
                      <span className="font-medium">Currently assigned to:</span> @{selectedTestCase.assigned_to}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <UserSelector
                      value={assignUser}
                      onChange={setAssignUser}
                      placeholder="Type to search collaborators..."
                      className="border rounded px-3 py-2 text-sm w-full"
                    />
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => assignTestCase("me")}
                        className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                        disabled={actionLoading}
                      >
                        Assign to me
                      </button>
                      <button
                        onClick={() => assignTestCase("user")}
                        className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                        disabled={actionLoading || !assignUser.trim()}
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => assignTestCase("clear")}
                        className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                        disabled={actionLoading}
                      >
                        Unassign
                      </button>
                    </div>
                  </div>
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
