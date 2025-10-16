"use client";

import { useEffect, useState } from "react";
import { TestCase } from "@/lib/types";

type SessionTest = {
  path: string;
  title: string;
  suite?: string;
  priority?: string;
  component?: string;
  steps?: string;
  expected?: string;
  preconditions?: string;
  story_id?: string;
  result: "pass" | "fail" | "skip" | null;
  notes: string;
  expanded?: boolean;
  stepResults?: { name: string; result: "pass" | "fail" | "skip" | null; notes: string }[];
};

type SessionMetadata = {
  name: string;
  environment: string;
  browser: string;
  build: string;
  tester: string;
};

export default function RunsPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionTests, setSessionTests] = useState<SessionTest[]>([]);
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata>({
    name: "",
    environment: "dev",
    browser: "",
    build: "",
    tester: "",
  });
  const [storiesRepo, setStoriesRepo] = useState("");

  // Filters for test selection
  const [filterSuite, setFilterSuite] = useState("");
  const [filterStory, setFilterStory] = useState("");
  const [filterComponent, setFilterComponent] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  // Parse multi-line steps text into an array of step items
  function parseStepsText(text?: string) {
    if (!text) return [] as { name: string; result: "pass" | "fail" | "skip" | null; notes: string }[];
    // Split by lines and strip any leading numbering like "1. ", "1) ", "1- "
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^\d+\s*[).:-]\s*/, ""));
    return lines.map((name) => ({ name, result: null as any, notes: "" }));
  }

  async function fetchTestCases() {
    try {
      setLoading(true);
      const res = await fetch("/api/github/testcases");
      if (!res.ok) throw new Error("Failed to fetch test cases");
      const data = await res.json();
      setTestCases(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function startSession() {
    // Filter test cases based on selected criteria
    const filtered = testCases.filter((tc) => {
      if (filterSuite && tc.suite !== filterSuite) return false;
      if (filterStory && tc.story_id !== filterStory) return false;
      if (filterComponent && tc.component !== filterComponent) return false;
      if (filterPriority && tc.priority !== filterPriority) return false;
      return true;
    });

    if (filtered.length === 0) {
      alert("No test cases match the selected filters. Please adjust your criteria.");
      return;
    }

    const tests: SessionTest[] = filtered.map((tc) => ({
      path: tc.path,
      title: tc.title || tc.name,
      suite: tc.suite,
      priority: tc.priority,
      component: tc.component,
      steps: tc.steps,
      expected: tc.expected,
      preconditions: tc.preconditions,
      story_id: tc.story_id,
      result: null,
      notes: "",
      expanded: false,
      stepResults: parseStepsText(tc.steps),
    }));

    setSessionTests(tests);
    setSessionActive(true);
  }

  function updateTestResult(index: number, result: "pass" | "fail" | "skip" | null) {
    const updated = [...sessionTests];
    updated[index].result = result;
    setSessionTests(updated);
  }

  function updateTestNotes(index: number, notes: string) {
    const updated = [...sessionTests];
    updated[index].notes = notes;
    setSessionTests(updated);
  }

  function toggleTestExpanded(index: number) {
    const updated = [...sessionTests];
    updated[index].expanded = !updated[index].expanded;
    setSessionTests(updated);
  }

  function updateStepResult(testIndex: number, stepIndex: number, value: "pass" | "fail" | "skip") {
    const updated = [...sessionTests];
    const steps = updated[testIndex].stepResults || [];
    if (steps[stepIndex]) steps[stepIndex].result = value;
    updated[testIndex].stepResults = steps;
    setSessionTests(updated);
  }

  function updateStepNotes(testIndex: number, stepIndex: number, notes: string) {
    const updated = [...sessionTests];
    const steps = updated[testIndex].stepResults || [];
    if (steps[stepIndex]) steps[stepIndex].notes = notes;
    updated[testIndex].stepResults = steps;
    setSessionTests(updated);
  }

  function markAllSteps(testIndex: number, value: "pass" | "fail" | "skip") {
    const updated = [...sessionTests];
    const steps = (updated[testIndex].stepResults || []).map((s) => ({ ...s, result: value }));
    updated[testIndex].stepResults = steps;
    setSessionTests(updated);
  }

  async function submitSession() {
    if (!sessionMetadata.name.trim()) {
      alert("Please enter a session name");
      return;
    }

    const executed = sessionTests.filter((t) => t.result !== null);
    if (executed.length === 0) {
      alert("Please execute at least one test before submitting");
      return;
    }

    setSubmitting(true);
    setSuccessMessage(null);

    try {
      // Submit all test results in a single batch to avoid conflicts
      const batchPayload = {
        results: executed.map((test) => ({
          path: test.path,
          result: test.result,
          notes: `[Session: ${sessionMetadata.name}] ${test.notes}\n\nEnvironment: ${sessionMetadata.environment}\nBrowser: ${sessionMetadata.browser || "N/A"}\nBuild: ${sessionMetadata.build || "N/A"}`,
          // Optional per-step results if any were recorded
          ...(test.stepResults && test.stepResults.some((s) => s.result || s.notes)
            ? {
                steps: test.stepResults.map((s) => ({ name: s.name, result: s.result, notes: s.notes })),
              }
            : {}),
        })),
      };

      const res = await fetch("/api/github/testcases/result/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batchPayload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit results");
      }

      const result = await res.json();
      
      if (result.failed > 0) {
        setSuccessMessage(
          `Session "${sessionMetadata.name}" completed with warnings! ${result.successful}/${executed.length} test(s) submitted successfully. ${result.failed} failed.`
        );
        console.warn("Failed results:", result.failedResults);
      } else {
        setSuccessMessage(
          `Session "${sessionMetadata.name}" completed! ${executed.length} test(s) submitted successfully.`
        );
      }
      
      // Reset session
      setSessionActive(false);
      setSessionTests([]);
      setSessionMetadata({
        name: "",
        environment: "dev",
        browser: "",
        build: "",
        tester: "",
      });
    } catch (e: any) {
      alert(`Error submitting session: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  function exportSessionCSV() {
    const headers = ["Test", "Suite", "Priority", "Component", "Result", "Notes"];
    const rows = [headers.join(",")];
    
    sessionTests.forEach((t) => {
      const row = [
        `"${t.title}"`,
        `"${t.suite || ""}"`,
        `"${t.priority || ""}"`,
        `"${t.component || ""}"`,
        `"${t.result || "Not Run"}"`,
        `"${t.notes.replace(/"/g, '""')}"`,
      ];
      rows.push(row.join(","));
    });

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session_${sessionMetadata.name || "results"}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function cancelSession() {
    if (confirm("Are you sure you want to cancel this session? All unsaved results will be lost.")) {
      setSessionActive(false);
      setSessionTests([]);
    }
  }

  // Collect unique values for filters
  const suites = Array.from(new Set(testCases.map((tc) => tc.suite).filter(Boolean))).sort();
  const stories = Array.from(new Set(testCases.map((tc) => tc.story_id).filter(Boolean))).sort();
  const components = Array.from(new Set(testCases.map((tc) => tc.component).filter(Boolean))).sort();
  const priorities = Array.from(new Set(testCases.map((tc) => tc.priority).filter(Boolean))).sort();

  const executedCount = sessionTests.filter((t) => t.result !== null).length;
  const passCount = sessionTests.filter((t) => t.result === "pass").length;
  const failCount = sessionTests.filter((t) => t.result === "fail").length;
  const skipCount = sessionTests.filter((t) => t.result === "skip").length;

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Test Run Sessions</h1>
        <div>Loading test cases...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Test Run Sessions</h1>
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Test Run Sessions</h1>

      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded text-green-800">
          {successMessage}
        </div>
      )}

      {!sessionActive ? (
        <div className="space-y-6">
          {/* Session Setup */}
          <div className="border rounded-lg p-6 bg-white">
            <h2 className="text-lg font-semibold mb-4">Create New Session</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Session Name *</label>
                <input
                  type="text"
                  value={sessionMetadata.name}
                  onChange={(e) => setSessionMetadata({ ...sessionMetadata, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., Sprint 5 Regression"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Environment *</label>
                <select
                  value={sessionMetadata.environment}
                  onChange={(e) => setSessionMetadata({ ...sessionMetadata, environment: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="dev">Development</option>
                  <option value="staging">Staging</option>
                  <option value="prod">Production</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Browser</label>
                <input
                  type="text"
                  value={sessionMetadata.browser}
                  onChange={(e) => setSessionMetadata({ ...sessionMetadata, browser: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., Chrome 120, Firefox 115"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Build/Version</label>
                <input
                  type="text"
                  value={sessionMetadata.build}
                  onChange={(e) => setSessionMetadata({ ...sessionMetadata, build: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., v2.5.0, build-1234"
                />
              </div>
            </div>

            <h3 className="text-md font-semibold mb-3">Select Tests to Run</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Suite</label>
                <select
                  value={filterSuite}
                  onChange={(e) => setFilterSuite(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">All Suites</option>
                  {suites.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Story</label>
                <select
                  value={filterStory}
                  onChange={(e) => setFilterStory(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">All Stories</option>
                  {stories.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Component</label>
                <select
                  value={filterComponent}
                  onChange={(e) => setFilterComponent(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">All Components</option>
                  {components.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">All Priorities</option>
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-sm text-gray-600 mb-4">
              {testCases.filter((tc) => {
                if (filterSuite && tc.suite !== filterSuite) return false;
                if (filterStory && tc.story_id !== filterStory) return false;
                if (filterComponent && tc.component !== filterComponent) return false;
                if (filterPriority && tc.priority !== filterPriority) return false;
                return true;
              }).length}{" "}
              test(s) match the selected filters
            </div>

            <button
              onClick={startSession}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            >
              Start Session
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Instructions Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">📋 How to Execute Tests:</h3>
            <ol className="text-sm text-blue-800 space-y-1 ml-4 list-decimal">
              <li>Click the <strong>arrow (▶)</strong> next to a test to see its steps and expected results</li>
              <li>Follow the test steps and perform the actions</li>
              <li>In the <strong>"Execution Notes"</strong> field, describe what actually happened (e.g., "Login successful - dashboard loaded")</li>
              <li>Click <strong>Pass</strong>, <strong>Fail</strong>, or <strong>Skip</strong> based on whether the actual results match the expected results</li>
              <li>Repeat for all tests, then click <strong>"Submit Session"</strong> at the bottom</li>
            </ol>
          </div>

          {/* Session Header */}
          <div className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{sessionMetadata.name}</h2>
                <div className="text-sm text-gray-600">
                  {sessionMetadata.environment} • {sessionMetadata.browser || "No browser"} • {sessionMetadata.build || "No build"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportSessionCSV}
                  className="px-4 py-2 border rounded hover:bg-gray-50 text-sm"
                >
                  Export CSV
                </button>
                <button
                  onClick={cancelSession}
                  className="px-4 py-2 border rounded hover:bg-gray-50 text-sm text-red-600"
                >
                  Cancel Session
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold">{sessionTests.length}</div>
                <div className="text-sm text-gray-600">Total Tests</div>
              </div>
              <div className="p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-700">{passCount}</div>
                <div className="text-sm text-gray-600">Pass</div>
              </div>
              <div className="p-3 bg-red-50 rounded">
                <div className="text-2xl font-bold text-red-700">{failCount}</div>
                <div className="text-sm text-gray-600">Fail</div>
              </div>
              <div className="p-3 bg-yellow-50 rounded">
                <div className="text-2xl font-bold text-yellow-700">{skipCount}</div>
                <div className="text-sm text-gray-600">Skip</div>
              </div>
            </div>
          </div>

          {/* Test List */}
          <div className="border rounded-lg bg-white">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">#</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Test Case</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Suite</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Priority</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Component</th>
                    <th className="px-4 py-3 text-left text-sm font-medium w-32">✓ Mark Result</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">📝 Execution Notes / Actual Results</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionTests.map((test, index) => (
                    <>
                      <tr key={test.path} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{index + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleTestExpanded(index)}
                              className="text-gray-500 hover:text-gray-700 focus:outline-none"
                              title={test.expanded ? "Collapse" : "Expand to see steps"}
                            >
                              <svg
                                className={`w-4 h-4 transform transition-transform ${
                                  test.expanded ? "rotate-90" : ""
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                            <span className="text-sm font-medium">{test.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{test.suite || "-"}</td>
                        <td className="px-4 py-3 text-sm">{test.priority || "-"}</td>
                        <td className="px-4 py-3 text-sm">{test.component || "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => updateTestResult(index, "pass")}
                              className={`px-3 py-1 rounded text-xs font-medium ${
                                test.result === "pass"
                                  ? "bg-green-600 text-white"
                                  : "bg-gray-100 text-gray-700 hover:bg-green-100"
                              }`}
                            >
                              Pass
                            </button>
                            <button
                              onClick={() => updateTestResult(index, "fail")}
                              className={`px-3 py-1 rounded text-xs font-medium ${
                                test.result === "fail"
                                  ? "bg-red-600 text-white"
                                  : "bg-gray-100 text-gray-700 hover:bg-red-100"
                              }`}
                            >
                              Fail
                            </button>
                            <button
                              onClick={() => updateTestResult(index, "skip")}
                              className={`px-3 py-1 rounded text-xs font-medium ${
                                test.result === "skip"
                                  ? "bg-yellow-600 text-white"
                                  : "bg-gray-100 text-gray-700 hover:bg-yellow-100"
                              }`}
                            >
                              Skip
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <textarea
                            value={test.notes}
                            onChange={(e) => updateTestNotes(index, e.target.value)}
                            placeholder="Enter what happened during execution...&#10;e.g., 'Login successful - redirected to dashboard'&#10;or 'Login failed - error message displayed'"
                            className="w-full border rounded px-2 py-1 text-sm min-h-[60px] resize-y"
                            rows={2}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Describe the actual result you observed
                          </p>
                        </td>
                      </tr>
                      {test.expanded && (
                        <tr key={`${test.path}-details`} className="bg-blue-50 border-b">
                          <td></td>
                          <td colSpan={6} className="px-4 py-4">
                            <div className="space-y-3">
                              {test.preconditions && (
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                    📋 Preconditions:
                                  </h4>
                                  <div className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border">
                                    {test.preconditions}
                                  </div>
                                </div>
                              )}
                              {test.stepResults && test.stepResults.length > 0 ? (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <h4 className="text-sm font-semibold text-gray-700">🔢 Test Steps</h4>
                                    <div className="flex gap-1">
                                      <button
                                        className="px-2 py-1 text-xs rounded border hover:bg-green-50"
                                        onClick={() => markAllSteps(index, "pass")}
                                        title="Mark all steps as Pass"
                                      >
                                        All Pass
                                      </button>
                                      <button
                                        className="px-2 py-1 text-xs rounded border hover:bg-red-50"
                                        onClick={() => markAllSteps(index, "fail")}
                                        title="Mark all steps as Fail"
                                      >
                                        All Fail
                                      </button>
                                      <button
                                        className="px-2 py-1 text-xs rounded border hover:bg-yellow-50"
                                        onClick={() => markAllSteps(index, "skip")}
                                        title="Mark all steps as Skip"
                                      >
                                        All Skip
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    {test.stepResults.map((s, si) => (
                                      <div key={si} className="bg-white border rounded p-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-sm text-gray-800 flex-1">{s.name}</div>
                                          <div className="flex gap-1">
                                            <button
                                              onClick={() => updateStepResult(index, si, "pass")}
                                              className={`px-2 py-0.5 rounded text-xs ${s.result === "pass" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-green-100"}`}
                                              title="Mark step Pass"
                                            >
                                              Pass
                                            </button>
                                            <button
                                              onClick={() => updateStepResult(index, si, "fail")}
                                              className={`px-2 py-0.5 rounded text-xs ${s.result === "fail" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-red-100"}`}
                                              title="Mark step Fail"
                                            >
                                              Fail
                                            </button>
                                            <button
                                              onClick={() => updateStepResult(index, si, "skip")}
                                              className={`px-2 py-0.5 rounded text-xs ${s.result === "skip" ? "bg-yellow-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-yellow-100"}`}
                                              title="Mark step Skip"
                                            >
                                              Skip
                                            </button>
                                          </div>
                                        </div>
                                        <textarea
                                          value={s.notes}
                                          onChange={(e) => updateStepNotes(index, si, e.target.value)}
                                          placeholder="Step-specific notes (optional)"
                                          className="mt-2 w-full border rounded px-2 py-1 text-xs min-h-[40px] resize-y"
                                          rows={2}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                test.steps ? (
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-1">🔢 Test Steps</h4>
                                    <div className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border">
                                      {test.steps}
                                    </div>
                                  </div>
                                ) : null
                              )}
                              {test.expected && (
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                    ✅ Expected Results:
                                  </h4>
                                  <div className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border">
                                    {test.expected}
                                  </div>
                                </div>
                              )}
                              {!test.steps && !test.expected && (
                                <div className="text-sm text-gray-500 italic">
                                  No test steps available for this test case.
                                </div>
                              )}
                              
                              {/* Create Defect from Failure */}
                              {test.result === "fail" && (
                                <div className="mt-4 pt-4 border-t">
                                  <button
                                    onClick={() => {
                                      const storyId = test.story_id || "";
                                      const testPath = test.path;
                                      const failNotes = test.notes || "";
                                      const title = `[BUG] ${test.title || "Test failure in session"}`;
                                      const body = `---
story_id: "${storyId}"
test_case: "${testPath}"
---

## Bug Description
Test case failed during bulk session execution.

## Test Case
${testPath}

## Steps to Reproduce
See test case: ${testPath}

## Expected Behavior
${test.expected || "Test should pass."}

## Actual Behavior
Test failed with notes: ${failNotes}

## Additional Context
- Session: ${sessionMetadata.name}
- Environment: ${sessionMetadata.environment}
- Browser: ${sessionMetadata.browser}
- Build: ${sessionMetadata.build}
- Tester: ${sessionMetadata.tester}
- Execution notes: ${failNotes}
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
                                    className="w-full px-4 py-2 rounded bg-orange-600 text-white text-sm hover:bg-orange-700 flex items-center justify-center gap-2"
                                    title="Create a defect issue from this failure"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Create Defect from Failure
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={cancelSession}
              className="px-6 py-2 border rounded hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={submitSession}
              disabled={submitting || executedCount === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : `Submit Session (${executedCount} tests)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
