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
  const [storyPreview, setStoryPreview] = useState<any | null>(null);
  const [loadingStory, setLoadingStory] = useState(false);
  const [storiesRepo, setStoriesRepo] = useState("");

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

  // Dynamic step fields
  const [stepsList, setStepsList] = useState<string[]>([""]);  
  const [expectedList, setExpectedList] = useState<string[]>([""]);  
  const [preconditionsList, setPreconditionsList] = useState<string[]>([""]);  
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);

  // Extract test case ID from filename
  const extractTestCaseId = (filename: string): string | null => {
    // Match both formats: TC-001 (new) and TC-1736936400000 (old timestamp)
    const match = filename.match(/^TC-(\d+)/);
    if (!match) return null;
    
    const idPart = match[1];
    // If it's a short number (1-4 digits), it's the new format
    if (idPart.length <= 4) {
      return `TC-${idPart.padStart(3, '0')}`; // Ensure 3 digits: TC-001
    }
    // If it's a long number (timestamp), show abbreviated version
    return `TC-${idPart.substring(0, 6)}...`; // TC-173693...
  };

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

  // Fetch test cases and config on mount
  useEffect(() => {
    fetchTestCases();
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/admin/config");
      if (res.ok) {
        const data = await res.json();
        setStoriesRepo(data.storiesRepo || "");
      }
    } catch (e) {
      // Silently fail, will use empty repo
    }
  }

  // Extract numeric ID from story_id (handles "MS-005", "US-005", "5", etc.)
  const extractStoryNumber = (input: string): string | null => {
    if (!input) return null;
    // Match any number in the string (e.g., "MS-005" -> "005" -> "5")
    const match = input.match(/\d+/);
    if (match) {
      // Convert to number and back to string to remove leading zeros
      return String(parseInt(match[0], 10));
    }
    return null;
  };

  // Fetch story preview when story_id changes
  useEffect(() => {
    const storyId = formData.story_id?.trim();
    if (!storyId || !showForm) {
      setStoryPreview(null);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setLoadingStory(true);
      try {
        // First try the original input (handles MS-005, US-V-005, or numeric IDs)
        let res = await fetch(`/api/github/stories?number=${encodeURIComponent(storyId)}`);
        
        if (res.ok) {
          const data = await res.json();
          setStoryPreview(data);
        } else {
          // Fallback: try extracting just the number (005 -> 5)
          const numericId = extractStoryNumber(storyId);
          if (numericId && numericId !== storyId) {
            res = await fetch(`/api/github/stories?number=${numericId}`);
            if (res.ok) {
              const data = await res.json();
              setStoryPreview(data);
            } else {
              setStoryPreview(null);
            }
          } else {
            setStoryPreview(null);
          }
        }
      } catch (err) {
        setStoryPreview(null);
      } finally {
        setLoadingStory(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(debounceTimer);
  }, [formData.story_id, showForm]);

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
      // Convert arrays to multi-line format if using step builder
      let stepsText = formData.steps;
      let expectedText = formData.expected;
      let preconditionsText = formData.preconditions;

      if (!useAdvancedMode) {
        // Filter out empty strings and join with newlines
        stepsText = stepsList
          .filter(s => s.trim())
          .map((s, i) => `${i + 1}. ${s}`)
          .join('\n');
        
        expectedText = expectedList
          .filter(e => e.trim())
          .map(e => `- ${e}`)
          .join('\n');
        
        preconditionsText = preconditionsList
          .filter(p => p.trim())
          .map(p => `- ${p}`)
          .join('\n');
      }

      // Keep original story_id format (MS-005, US-V-001, etc.)
      const normalizedFormData = {
        ...formData,
        story_id: formData.story_id?.trim() || "",
        steps: stepsText,
        expected: expectedText,
        preconditions: preconditionsText,
      };

      const res = await fetch("/api/github/testcases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedFormData),
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
      
      // Reset dynamic lists
      setStepsList([""]);
      setExpectedList([""]);
      setPreconditionsList([""]);

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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form - Left 2 columns */}
              <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-2">
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
                <p className="text-xs text-gray-500 mt-1">Short, action-focused name. Used in file name/slug.</p>
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
                <p className="text-xs text-gray-500 mt-1">Saved under qa-testcases/{formData.folder || "manual/General"}. Use paths under "manual/…" or "Regression".</p>
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
                  placeholder="e.g., MS-005 or US-V-005 or 21"
                />
                <p className="text-xs text-gray-500 mt-1">Enter story key or issue number. Accepted: MS-005, US-V-005, or 21.</p>
                {storyPreview && (
                  <p className="text-xs text-green-600 mt-1 font-medium">✓ Story #{storyPreview.number} found</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Test Steps *</label>
                  <button
                    type="button"
                    onClick={() => setUseAdvancedMode(!useAdvancedMode)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {useAdvancedMode ? "Switch to Step Builder" : "Switch to Text Mode"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-2">Use the builder or paste numbered lines (1., 2., …). In Runs, each step can be marked Pass/Fail/Skip with notes.</p>
                
                {!useAdvancedMode ? (
                  <div className="space-y-2">
                    {stepsList.map((step, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-sm text-gray-500 pt-2 w-8">{index + 1}.</span>
                        <input
                          type="text"
                          value={step}
                          onChange={(e) => {
                            const updated = [...stepsList];
                            updated[index] = e.target.value;
                            setStepsList(updated);
                          }}
                          className="flex-1 border rounded px-3 py-2"
                          placeholder={`Enter step ${index + 1}`}
                          required={index === 0}
                        />
                        {stepsList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = stepsList.filter((_, i) => i !== index);
                              setStepsList(updated.length ? updated : [""]);
                            }}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded"
                            title="Remove step"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStepsList([...stepsList, ""])}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      + Add Step
                    </button>
                  </div>
                ) : (
                  <textarea
                    required
                    value={formData.steps}
                    onChange={(e) => setFormData({ ...formData, steps: e.target.value })}
                    className="w-full border rounded px-3 py-2 h-32"
                    placeholder="1. Navigate to login page&#10;2. Enter username&#10;3. Enter password&#10;4. Click login"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Expected Results *</label>
                <p className="text-xs text-gray-500 -mt-1 mb-2">Bullet list of observable outcomes, one per line.</p>
                {!useAdvancedMode ? (
                  <div className="space-y-2">
                    {expectedList.map((expected, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-sm text-gray-500 pt-2 w-8">-</span>
                        <input
                          type="text"
                          value={expected}
                          onChange={(e) => {
                            const updated = [...expectedList];
                            updated[index] = e.target.value;
                            setExpectedList(updated);
                          }}
                          className="flex-1 border rounded px-3 py-2"
                          placeholder={`Expected result ${index + 1}`}
                          required={index === 0}
                        />
                        {expectedList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = expectedList.filter((_, i) => i !== index);
                              setExpectedList(updated.length ? updated : [""]);
                            }}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded"
                            title="Remove expected result"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setExpectedList([...expectedList, ""])}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      + Add Expected Result
                    </button>
                  </div>
                ) : (
                  <textarea
                    required
                    value={formData.expected}
                    onChange={(e) => setFormData({ ...formData, expected: e.target.value })}
                    className="w-full border rounded px-3 py-2 h-24"
                    placeholder="User should be logged in and redirected to dashboard"
                  />
                )}
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
                  <p className="text-xs text-gray-500 mt-1">Use P1 for critical paths, P2 for high-impact, P3 for routine.</p>
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
                  <p className="text-xs text-gray-500 mt-1">Group related cases (e.g., Smoke, Regression, Authentication).</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Component</label>
                  <input
                    type="text"
                    value={formData.component}
                    onChange={(e) => setFormData({ ...formData, component: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., Login, Checkout"
                  />
                  <p className="text-xs text-gray-500 mt-1">Feature or area under test (used for filtering and reporting).</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Environment</label>
                  <input
                    type="text"
                    value={formData.env}
                    onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., dev, staging, prod"
                  />
                  <p className="text-xs text-gray-500 mt-1">Target environment for this test (optional).</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Preconditions</label>
                <p className="text-xs text-gray-500 -mt-1 mb-2">Bulleted prerequisites (e.g., seeded data, configs, accounts).</p>
                {!useAdvancedMode ? (
                  <div className="space-y-2">
                    {preconditionsList.map((precondition, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-sm text-gray-500 pt-2 w-8">-</span>
                        <input
                          type="text"
                          value={precondition}
                          onChange={(e) => {
                            const updated = [...preconditionsList];
                            updated[index] = e.target.value;
                            setPreconditionsList(updated);
                          }}
                          className="flex-1 border rounded px-3 py-2"
                          placeholder={`Precondition ${index + 1}`}
                        />
                        {preconditionsList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = preconditionsList.filter((_, i) => i !== index);
                              setPreconditionsList(updated.length ? updated : [""]);
                            }}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded"
                            title="Remove precondition"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPreconditionsList([...preconditionsList, ""])}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      + Add Precondition
                    </button>
                  </div>
                ) : (
                  <textarea
                    value={formData.preconditions}
                    onChange={(e) => setFormData({ ...formData, preconditions: e.target.value })}
                    className="w-full border rounded px-3 py-2 h-20"
                    placeholder="Setup requirements or prerequisites"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Test Data</label>
                <textarea
                  value={formData.data}
                  onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                  className="w-full border rounded px-3 py-2 h-20"
                  placeholder="Test data notes or references"
                />
                <p className="text-xs text-gray-500 mt-1">Optional. Add inline notes or SQL. In Runs, dedicated SQL sections appear when you add frontmatter keys like <code>setup_sql</code>, <code>verification_sql</code>, <code>teardown_sql</code> or file refs <code>setup_sql_file</code>, <code>verification_sql_file</code>, <code>teardown_sql_file</code>.</p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Creating PR..." : "Create Test Case"}
              </button>
            </form>

              {/* Story Preview - Right column */}
              <div className="lg:col-span-1">
                {loadingStory && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading story...
                    </div>
                  </div>
                )}

                {storyPreview && !loadingStory && (
                  <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-indigo-50 sticky top-4">
                    <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Story #{storyPreview.number}
                    </h3>
                    <h4 className="font-bold text-gray-900 mb-3">{storyPreview.title}</h4>
                    
                    {storyPreview.labels && storyPreview.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {storyPreview.labels.map((label: any) => (
                          <span
                            key={label.name}
                            className="text-[10px] px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: `#${label.color}`,
                              color: parseInt(label.color || "000000", 16) > 0xffffff / 2 ? "#000" : "#fff",
                            }}
                          >
                            {label.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {storyPreview.body && (
                      <div className="text-sm text-gray-700 bg-white rounded p-3 mb-3 max-h-60 overflow-y-auto">
                        <div className="whitespace-pre-wrap">{storyPreview.body}</div>
                      </div>
                    )}

                    {storyPreview.milestone && (
                      <div className="text-xs text-gray-600 mb-2">
                        <span className="font-medium">Milestone:</span> {storyPreview.milestone.title}
                      </div>
                    )}

                    {storyPreview.assignees && storyPreview.assignees.length > 0 && (
                      <div className="text-xs text-gray-600 mb-2">
                        <span className="font-medium">Assigned to:</span> {storyPreview.assignees.map((a: any) => `@${a.login}`).join(", ")}
                      </div>
                    )}

                    <a
                      href={storyPreview.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      View on GitHub
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}

                {formData.story_id && !storyPreview && !loadingStory && (
                  <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
                    <p className="text-sm text-yellow-800">
                      <strong>Story not found</strong><br />
                      No story found with ID #{formData.story_id}. Please check the ID.
                    </p>
                  </div>
                )}

                {!formData.story_id && (
                  <div className="border rounded-lg p-4 bg-gray-50 text-center">
                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-600">
                      Enter a Story ID to see details
                    </p>
                  </div>
                )}
              </div>
            </div>
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
                    {(() => {
                      const tcId = extractTestCaseId(f.name);
                      return tcId ? (
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-indigo-100 text-indigo-700 border border-indigo-300">
                          {tcId}
                        </span>
                      ) : null;
                    })()}
                    <div className="font-medium text-sm">{displayName(f)}</div>
                    {f.suite && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border">
                        {f.suite}
                      </span>
                    )}
                    {f.priority && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        {f.priority}
                      </span>
                    )}
                    {f.component && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                        {f.component}
                      </span>
                    )}
                    {f.status && (
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${
                        f.status === "Approved" ? "bg-green-100 text-green-800 border-green-300" :
                        f.status === "Ready" ? "bg-blue-100 text-blue-800 border-blue-300" :
                        f.status === "Obsolete" ? "bg-gray-100 text-gray-600 border-gray-300" :
                        "bg-yellow-100 text-yellow-800 border-yellow-300"
                      }`}>
                        {f.status}
                      </span>
                    )}
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
                              {/* Test Case ID */}
                              {(() => {
                                const tcId = extractTestCaseId(selectedFile?.split('/').pop() || '');
                                return tcId ? (
                                  <div>
                                    <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Test Case ID</div>
                                    <div className="text-sm font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded inline-block">{tcId}</div>
                                  </div>
                                ) : null;
                              })()}
                              {metadata.title && (
                                <div className={extractTestCaseId(selectedFile?.split('/').pop() || '') ? "" : "col-span-2"}>
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Title</div>
                                  <div className="text-lg font-bold text-gray-800">{metadata.title}</div>
                                </div>
                              )}
                              {metadata.story_id && (
                                <div>
                                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Story</div>
                                  <div className="text-sm text-gray-700 font-medium">{metadata.story_id}</div>
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

                  {/* Create Defect from Failure */}
                  {latestRun && String(latestRun.result).toLowerCase() === "fail" && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          const storyId = selectedTestCase?.story_id || "";
                          const testPath = selectedFile || "";
                          const failNotes = latestRun.notes || notes || "";
                          const title = `[BUG] ${selectedTestCase?.title || selectedTestCase?.name || "Test failure"}`;
                          const body = `---
story_id: "${storyId}"
test_case: "${testPath}"
---

## Bug Description
Test case failed during execution.

## Test Case
${testPath}

## Steps to Reproduce
See test case: ${testPath}

## Expected Behavior
Test should pass.

## Actual Behavior
Test failed with notes: ${failNotes}

## Additional Context
- Executed by: @${latestRun.executed_by}
- Executed at: ${new Date(latestRun.executed_at).toLocaleString()}
- Latest run notes: ${failNotes}
`;
                          const params = new URLSearchParams({
                            title,
                            body,
                            labels: "bug,defect,test-failure",
                          });
                          const repoUrl = storiesRepo.includes("github.com") 
                            ? storiesRepo.replace(/\.git$/, "")
                            : `https://github.com/${storiesRepo}`;
                          window.open(`${repoUrl}/issues/new?${params.toString()}`, "_blank");
                        }}
                        className="w-full px-3 py-2 rounded bg-orange-600 text-white text-sm hover:bg-orange-700 flex items-center justify-center gap-2"
                        title="Create a defect issue from this failure"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Create Defect from Failure
                      </button>
                    </div>
                  )}

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
