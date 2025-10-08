"use client";

import { useEffect, useState } from "react";
import { TestCase } from "@/lib/types";

type SessionTest = {
  path: string;
  title: string;
  suite?: string;
  priority?: string;
  component?: string;
  result: "pass" | "fail" | "skip" | null;
  notes: string;
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

  // Filters for test selection
  const [filterSuite, setFilterSuite] = useState("");
  const [filterStory, setFilterStory] = useState("");
  const [filterComponent, setFilterComponent] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchTestCases();
  }, []);

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
      result: null,
      notes: "",
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
      // Submit each executed test result
      const results = await Promise.all(
        executed.map(async (test) => {
          const res = await fetch("/api/github/testcases/result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: test.path,
              result: test.result,
              notes: `[Session: ${sessionMetadata.name}] ${test.notes}\n\nEnvironment: ${sessionMetadata.environment}\nBrowser: ${sessionMetadata.browser || "N/A"}\nBuild: ${sessionMetadata.build || "N/A"}`,
            }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to submit result");
          }
          return await res.json();
        })
      );

      setSuccessMessage(
        `Session "${sessionMetadata.name}" completed! ${executed.length} test(s) submitted. PRs created and will be auto-merged.`
      );
      
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
                    <th className="px-4 py-3 text-left text-sm font-medium">Result</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionTests.map((test, index) => (
                    <tr key={test.path} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">{test.title}</td>
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
                        <input
                          type="text"
                          value={test.notes}
                          onChange={(e) => updateTestNotes(index, e.target.value)}
                          placeholder="Add notes..."
                          className="w-full border rounded px-2 py-1 text-sm"
                        />
                      </td>
                    </tr>
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
