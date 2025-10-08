"use client";

import { useEffect, useMemo, useState } from "react";

type MatrixRun = {
  result: string;
  executed_at: string;
  executed_by: string;
};

type MatrixTest = {
  path: string;
  title: string;
  assigned_to: string | null;
  suite: string | null;
  priority: string | null;
  latestRun: MatrixRun | null;
  defects: { number: number; title: string; state: string; url: string }[];
  url: string;
};

type MatrixStory = {
  number: number;
  key: string; // e.g., US-123
  title: string;
  url: string;
  assignees: string[];
  labels: { name: string; color: string }[];
  milestone: string | null;
  tests: MatrixTest[];
  defects: { number: number; title: string; state: string; url: string }[];
  metrics: { testCount: number; pass: number; fail: number; noRun: number; coveragePercent: number };
};

type MatrixResponse = {
  stories: MatrixStory[];
  gaps: {
    storiesWithoutTests: number[];
    testCasesWithoutStory: string[];
    defectsWithoutLink: number[];
  };
};

type SavedView = {
  name: string;
  filters: {
    search: string;
    label: string;
    milestone: string;
    suite: string;
    priority: string;
    folder: string;
    assignee: string;
  };
};

export default function TraceabilityPage() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState("");
  const [suiteFilter, setSuiteFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  // Saved views
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showSaveView, setShowSaveView] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  // Coverage threshold
  const [coverageThreshold, setCoverageThreshold] = useState<number>(60);
  const [showAtRiskOnly, setShowAtRiskOnly] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selectedStory, setSelectedStory] = useState<MatrixStory | null>(null);

  // Load saved views and settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("traceability_saved_views");
    if (stored) {
      try {
        setSavedViews(JSON.parse(stored));
      } catch {}
    }
    
    const threshold = localStorage.getItem("coverage_threshold");
    if (threshold) {
      setCoverageThreshold(parseInt(threshold, 10));
    }
  }, []);

  // Save threshold to localStorage when changed
  useEffect(() => {
    localStorage.setItem("coverage_threshold", String(coverageThreshold));
  }, [coverageThreshold]);

  function fetchMatrix(nocache = false) {
    let mounted = true;
    setLoading(true);
    setError(null);
    setCacheStatus("");
    const url = nocache ? "/api/traceability/matrix?nocache=1" : "/api/traceability/matrix";
    
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const cacheHeader = res.headers.get("X-Cache");
        if (cacheHeader) setCacheStatus(cacheHeader);
        return res.json();
      })
      .then((json) => {
        if (mounted) setData(json);
      })
      .catch((e) => setError(e.message || "Failed to load matrix"))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      mounted = false;
    };
  }

  useEffect(() => {
    fetchMatrix();
  }, []);

  function refreshMatrix() {
    setRefreshing(true);
    fetchMatrix(true);
  }

  function saveCurrentView() {
    if (!newViewName.trim()) {
      alert("Please enter a view name");
      return;
    }

    const newView: SavedView = {
      name: newViewName.trim(),
      filters: {
        search,
        label: labelFilter,
        milestone: milestoneFilter,
        suite: suiteFilter,
        priority: priorityFilter,
        folder: folderFilter,
        assignee: assigneeFilter,
      },
    };

    const updated = [...savedViews, newView];
    setSavedViews(updated);
    localStorage.setItem("traceability_saved_views", JSON.stringify(updated));
    setNewViewName("");
    setShowSaveView(false);
  }

  function loadView(view: SavedView) {
    setSearch(view.filters.search);
    setLabelFilter(view.filters.label);
    setMilestoneFilter(view.filters.milestone);
    setSuiteFilter(view.filters.suite);
    setPriorityFilter(view.filters.priority);
    setFolderFilter(view.filters.folder);
    setAssigneeFilter(view.filters.assignee);
  }

  function deleteView(index: number) {
    if (confirm(`Delete view "${savedViews[index].name}"?`)) {
      const updated = savedViews.filter((_, i) => i !== index);
      setSavedViews(updated);
      localStorage.setItem("traceability_saved_views", JSON.stringify(updated));
    }
  }

  function clearAllFilters() {
    setSearch("");
    setLabelFilter("");
    setMilestoneFilter("");
    setSuiteFilter("");
    setPriorityFilter("");
    setFolderFilter("");
    setAssigneeFilter("");
  }

  const filteredStories = useMemo(() => {
    if (!data) return [] as MatrixStory[];
    const sTerm = search.trim().toLowerCase();
    const lTerm = labelFilter.trim().toLowerCase();
    const mTerm = milestoneFilter.trim().toLowerCase();
    const suiteTerm = suiteFilter.trim().toLowerCase();
    const prioTerm = priorityFilter.trim().toLowerCase();
    const folderTerm = folderFilter.trim().toLowerCase();
    const assigneeTerm = assigneeFilter.trim().toLowerCase();

    return data.stories
      .filter((s) => {
        // Story-level filters
        if (sTerm) {
          const inTitle = s.title.toLowerCase().includes(sTerm);
          const inKey = s.key.toLowerCase().includes(sTerm);
          if (!inTitle && !inKey) return false;
        }
        if (lTerm) {
          const hasLabel = s.labels?.some((l) => l.name?.toLowerCase().includes(lTerm));
          if (!hasLabel) return false;
        }
        if (mTerm) {
          const hasMilestone = (s.milestone || "").toLowerCase().includes(mTerm);
          if (!hasMilestone) return false;
        }
        if (assigneeTerm) {
          const storyAssignee = s.assignees?.some((a) => a.toLowerCase().includes(assigneeTerm));
          // allow match at story or at test level; if neither, drop later below
          if (!storyAssignee) {
            // We'll check test-level after filtering tests
          }
        }
        
        // At-risk filter: show only stories below coverage threshold
        if (showAtRiskOnly) {
          const coverage = s.metrics.testCount > 0 
            ? Math.round((s.metrics.pass / s.metrics.testCount) * 100)
            : 0;
          if (coverage >= coverageThreshold && s.metrics.testCount > 0) return false;
        }
        
        return true;
      })
      .map((s) => {
        // Apply test-level filters within each story
        const tests = s.tests.filter((t) => {
          if (suiteTerm && (t.suite || "").toLowerCase().indexOf(suiteTerm) === -1) return false;
          if (prioTerm && (t.priority || "").toLowerCase().indexOf(prioTerm) === -1) return false;
          if (folderTerm && t.path.toLowerCase().indexOf(folderTerm) === -1) return false;
          if (assigneeTerm) {
            const testAssigned = (t.assigned_to || "").toLowerCase().includes(assigneeTerm);
            const storyAssigned = s.assignees?.some((a) => a.toLowerCase().includes(assigneeTerm));
            if (!testAssigned && !storyAssigned) return false;
          }
          return true;
        });
        return { ...s, tests } as MatrixStory;
      })
      .filter((s) => {
        // If any of the test-level filters are set, only keep stories with remaining tests
        const testFiltersActive = !!(suiteTerm || prioTerm || folderTerm || assigneeTerm);
        return testFiltersActive ? s.tests.length > 0 : true;
      });
  }, [data, search, labelFilter, milestoneFilter, suiteFilter, priorityFilter, folderFilter, assigneeFilter]);

  function toggleExpand(num: number) {
    setExpanded((prev) => ({ ...prev, [num]: !prev[num] }));
  }

  function openStoryDetails(s: MatrixStory) {
    setSelectedStory(s);
  }

  function closeStoryDetails() {
    setSelectedStory(null);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedStory) {
        e.preventDefault();
        setSelectedStory(null);
      }
    }
    if (selectedStory) {
      window.addEventListener("keydown", onKeyDown);
    }
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedStory]);

  function csvEscape(val: any): string {
    if (val === null || val === undefined) return "";
    let s = String(val);
    if (s.includes('"')) s = s.replace(/"/g, '""');
    if (/[",\n]/.test(s)) return `"${s}"`;
    return s;
  }

  function exportMatrixCsv() {
    if (!data) return;
    const headers = [
      "story_number",
      "story_key",
      "story_title",
      "story_url",
      "story_assignees",
      "story_labels",
      "story_milestone",
      "test_count",
      "pass_count",
      "coverage_percent",
      "coverage_status",
      "test_path",
      "test_title",
      "test_url",
      "test_assigned_to",
      "test_suite",
      "test_priority",
      "latest_result",
      "latest_executed_at",
      "latest_executed_by",
      "defect_open_count",
      "defect_closed_count",
      "defect_numbers"
    ];

    const rows: string[] = [];
    rows.push(headers.join(","));

    const list = filteredStories.length ? filteredStories : data.stories;

    for (const s of list) {
      const assigneesStr = (s.assignees || []).join("; ");
      const labelsStr = (s.labels || []).map((l) => l.name).join("; ");
      const coverage = s.metrics.testCount > 0 
        ? Math.round((s.metrics.pass / s.metrics.testCount) * 100)
        : 0;
      const coverageStatus = s.metrics.testCount === 0 
        ? "NO_TESTS"
        : coverage < coverageThreshold 
          ? "AT_RISK"
          : "OK";
      
      if (s.tests.length === 0) {
        const row = [
          s.number,
          s.key,
          s.title,
          s.url,
          assigneesStr,
          labelsStr,
          s.milestone || "",
          s.metrics.testCount,
          s.metrics.pass,
          coverage,
          coverageStatus,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          0,
          0,
          ""
        ].map(csvEscape).join(",");
        rows.push(row);
      } else {
        for (const t of s.tests) {
          const openCount = t.defects.filter((d) => (d.state || "").toLowerCase() === "open").length;
          const closedCount = t.defects.length - openCount;
          const defectNumbers = t.defects.map((d) => `#${d.number}`).join("; ");
          const row = [
            s.number,
            s.key,
            s.title,
            s.url,
            assigneesStr,
            labelsStr,
            s.milestone || "",
            s.metrics.testCount,
            s.metrics.pass,
            coverage,
            coverageStatus,
            t.path,
            t.title,
            t.url,
            t.assigned_to || "",
            t.suite || "",
            t.priority || "",
            (t.latestRun?.result || "").toUpperCase(),
            t.latestRun?.executed_at || "",
            t.latestRun?.executed_by || "",
            openCount,
            closedCount,
            defectNumbers
          ].map(csvEscape).join(",");
          rows.push(row);
        }
      }
    }

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traceability_matrix_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportGapsCsv() {
    if (!data) return;
    const headers = ["category", "identifier"];
    const rows: string[] = [];
    rows.push(headers.join(","));
    for (const n of data.gaps.storiesWithoutTests) {
      rows.push(["story_without_tests", `#${n}`].map(csvEscape).join(","));
    }
    for (const p of data.gaps.testCasesWithoutStory) {
      rows.push(["test_without_story", p].map(csvEscape).join(","));
    }
    for (const n of data.gaps.defectsWithoutLink) {
      rows.push(["defect_without_link", `#${n}`].map(csvEscape).join(","));
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traceability_gaps_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading traceability matrix...</div>
      </div>
    );
  }

  if (error) {
    const isAuth = /Not authenticated/i.test(error);
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Traceability</h1>
        <div className="text-red-600 mb-4">{error}</div>
        {isAuth && (
          <a href="/api/auth/signin" className="text-blue-600 hover:underline">Sign in with GitHub →</a>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Traceability</h1>
        <div>No data available.</div>
      </div>
    );
  }

  // Collect filter options from data
  const allLabels = Array.from(new Set(data.stories.flatMap((s) => s.labels?.map((l) => l.name) || []))).sort();
  const allMilestones = Array.from(new Set(data.stories.map((s) => s.milestone).filter(Boolean) as string[])).sort();
  const allSuites = Array.from(new Set(data.stories.flatMap((s) => s.tests.map((t) => t.suite || "")).filter(Boolean))).sort();
  const allPriorities = Array.from(new Set(data.stories.flatMap((s) => s.tests.map((t) => t.priority || "")).filter(Boolean))).sort();
  const allAssignees = Array.from(new Set([
    ...data.stories.flatMap((s) => s.assignees || []),
    ...data.stories.flatMap((s) => s.tests.map((t) => t.assigned_to || "")).filter(Boolean) as string[],
  ])).sort();

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">Traceability</h1>
          <div className="flex items-center gap-3">
            {cacheStatus && (
              <span className={`text-xs px-2 py-1 rounded ${cacheStatus === "HIT" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                Cache: {cacheStatus}
              </span>
            )}
            <button
              onClick={refreshMatrix}
              disabled={refreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {refreshing ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Refreshing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 border rounded hover:bg-gray-50 text-sm flex items-center gap-2"
              title="Coverage Settings"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </div>
        </div>

        {/* Coverage Alert Banner */}
        {data && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-blue-900">
                Coverage Threshold: {coverageThreshold}%
              </span>
              <span className="text-sm text-blue-700">
                {data.stories.filter(s => {
                  const coverage = s.metrics.testCount > 0 
                    ? Math.round((s.metrics.pass / s.metrics.testCount) * 100)
                    : 0;
                  return s.metrics.testCount === 0 || coverage < coverageThreshold;
                }).length} stories at risk
              </span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAtRiskOnly}
                onChange={(e) => setShowAtRiskOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium text-blue-900">Show at-risk only</span>
            </label>
          </div>
        )}

        {/* Saved Views */}
        {savedViews.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded border">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Saved Views:</span>
              {savedViews.map((view, index) => (
                <div key={index} className="flex items-center gap-1">
                  <button
                    onClick={() => loadView(view)}
                    className="px-3 py-1 bg-white border rounded text-sm hover:bg-blue-50"
                  >
                    {view.name}
                  </button>
                  <button
                    onClick={() => deleteView(index)}
                    className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs"
                    title="Delete view"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search story title or key (e.g., US-123)"
            className="border rounded px-3 py-2 text-sm"
          />

          <input
            list="labels-list"
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            placeholder="Label"
            className="border rounded px-3 py-2 text-sm"
          />
          <datalist id="labels-list">
            {allLabels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <input
            list="milestones-list"
            value={milestoneFilter}
            onChange={(e) => setMilestoneFilter(e.target.value)}
            placeholder="Milestone"
            className="border rounded px-3 py-2 text-sm"
          />
          <datalist id="milestones-list">
            {allMilestones.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <input
            list="suites-list"
            value={suiteFilter}
            onChange={(e) => setSuiteFilter(e.target.value)}
            placeholder="Suite"
            className="border rounded px-3 py-2 text-sm"
          />
          <datalist id="suites-list">
            {allSuites.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <input
            list="priorities-list"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            placeholder="Priority"
            className="border rounded px-3 py-2 text-sm"
          />
          <datalist id="priorities-list">
            {allPriorities.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>

          <input
            type="text"
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            placeholder="Folder contains (e.g., Regression)"
            className="border rounded px-3 py-2 text-sm"
          />

          <input
            list="assignees-list"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            placeholder="Assignee (@user)"
            className="border rounded px-3 py-2 text-sm"
          />
          <datalist id="assignees-list">
            {allAssignees.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              Showing {filteredStories.length} of {data.stories.length} stories
            </div>
            <button
              onClick={clearAllFilters}
              className="px-3 py-1 rounded border text-xs hover:bg-gray-50 text-gray-600"
            >
              Clear Filters
            </button>
            <button
              onClick={() => setShowSaveView(true)}
              className="px-3 py-1 rounded border text-xs hover:bg-gray-50 text-blue-600"
            >
              Save View
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportMatrixCsv}
              className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              onClick={exportGapsCsv}
              className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
            >
              Export Gaps CSV
            </button>
          </div>
        </div>

        {/* Save View Modal */}
        {showSaveView && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowSaveView(false)}>
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Save Current View</h3>
              <input
                type="text"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Enter view name (e.g., P1 Tests Only)"
                className="w-full border rounded px-3 py-2 mb-4"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveCurrentView()}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSaveView(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCurrentView}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Coverage Settings</h3>
              
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  Coverage Threshold (%)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={coverageThreshold}
                    onChange={(e) => setCoverageThreshold(parseInt(e.target.value, 10))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={coverageThreshold}
                    onChange={(e) => setCoverageThreshold(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                    className="w-20 border rounded px-3 py-2 text-center"
                  />
                  <span className="text-sm font-medium">%</span>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Stories with pass rate below this threshold will be highlighted as at-risk
                </p>
              </div>

              <div className="bg-gray-50 p-3 rounded mb-4">
                <h4 className="text-sm font-semibold mb-2">Coverage Status Legend:</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
                    <span><strong>AT_RISK:</strong> Pass rate below {coverageThreshold}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
                    <span><strong>NO_TESTS:</strong> Story has no test cases</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
                    <span><strong>OK:</strong> Pass rate at or above {coverageThreshold}%</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Matrix Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 bg-gray-50 border-b px-4 py-2 text-sm font-semibold">
          <div className="col-span-4">Story</div>
          <div className="col-span-3">Tests</div>
          <div className="col-span-3">Defects</div>
          <div className="col-span-2">Coverage</div>
        </div>
        {filteredStories.map((s) => {
          const coverage = s.metrics.testCount > 0 
            ? Math.round((s.metrics.pass / s.metrics.testCount) * 100)
            : 0;
          const isAtRisk = s.metrics.testCount === 0 || coverage < coverageThreshold;
          const bgColor = s.metrics.testCount === 0 
            ? "bg-yellow-50" 
            : coverage < coverageThreshold 
              ? "bg-red-50" 
              : "";
          
          return (
          <div key={s.number} className={`border-b ${bgColor}`}>
            <div className="grid grid-cols-12 px-4 py-3 items-center gap-3">
              <div className="col-span-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleExpand(s.number)}
                    className="w-6 h-6 flex items-center justify-center rounded border text-xs hover:bg-gray-50"
                    aria-label="Toggle details"
                  >
                    {expanded[s.number] ? "-" : "+"}
                  </button>
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
                    {s.key}
                  </a>
                  <span className="text-gray-800">{s.title}</span>
                  <button
                    onClick={() => openStoryDetails(s)}
                    className="ml-1 px-2 py-0.5 text-xs rounded border hover:bg-gray-50"
                    aria-label={`Open details for ${s.key}`}
                  >
                    Details
                  </button>
                </div>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {s.labels?.slice(0, 4).map((l) => (
                    <span
                      key={l.name}
                      className="px-2 py-0.5 rounded text-[11px] border"
                      style={{
                        backgroundColor: `#${l.color}`,
                        color: parseInt(l.color || "000000", 16) > 0xffffff / 2 ? "#000" : "#fff",
                        borderColor: `#${l.color}`,
                      }}
                    >
                      {l.name}
                    </span>
                  ))}
                  {s.milestone && (
                    <span className="px-2 py-0.5 rounded text-[11px] bg-purple-50 text-purple-700 border border-purple-200">
                      {s.milestone}
                    </span>
                  )}
                  {s.assignees?.slice(0, 3).map((a) => (
                    <span key={a} className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800 border border-blue-300">
                      @{a}
                    </span>
                  ))}
                </div>
              </div>

              <div className="col-span-3 text-sm">
                <div>
                  {s.metrics.testCount} tests ·
                  <span className="ml-1 text-green-700">{s.metrics.pass} pass</span> ·
                  <span className="ml-1 text-red-700">{s.metrics.fail} fail</span> ·
                  <span className="ml-1 text-gray-600">{s.metrics.noRun} no run</span>
                </div>
              </div>

              <div className="col-span-3 text-sm">
                {s.defects.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {s.defects.slice(0, 3).map((d) => (
                      <a
                        key={d.number}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`px-2 py-0.5 rounded text-[11px] border ${
                          d.state === "open" ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"
                        }`}
                      >
                        #{d.number} {d.title}
                      </a>
                    ))}
                    {s.defects.length > 3 && (
                      <span className="text-xs text-gray-600">+{s.defects.length - 3} more</span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-500">No defects</span>
                )}
              </div>

              <div className="col-span-2">
                <div className="text-xs text-gray-600 mb-1">{s.metrics.coveragePercent}%</div>
                <div className="h-2 bg-gray-200 rounded">
                  <div
                    className="h-2 bg-gradient-to-r from-green-500 to-green-600 rounded"
                    style={{ width: `${Math.min(100, Math.max(0, s.metrics.coveragePercent))}%` }}
                  />
                </div>
              </div>
            </div>

            {expanded[s.number] && (
              <div className="px-6 pb-4">
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {s.tests.length > 0 ? (
                    s.tests.map((t) => (
                      <div key={t.path} className="border rounded p-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <a href={t.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-medium">
                              {t.title}
                            </a>
                            <code className="text-xs text-gray-500">{t.path}</code>
                          </div>
                          <div className="flex items-center gap-2">
                            {t.assigned_to && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800 border border-blue-300">
                                @{t.assigned_to}
                              </span>
                            )}
                            {t.suite && (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700 border">{t.suite}</span>
                            )}
                            {t.priority && (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800 border border-amber-200">{t.priority}</span>
                            )}
                            {t.latestRun ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] border ${
                                  t.latestRun.result === "pass"
                                    ? "bg-green-100 text-green-800 border-green-300"
                                    : t.latestRun.result === "fail"
                                    ? "bg-red-100 text-red-800 border-red-300"
                                    : "bg-gray-100 text-gray-700 border-gray-300"
                                }`}
                              >
                                {t.latestRun.result.toUpperCase()} by @{t.latestRun.executed_by}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700 border">NO RUN</span>
                            )}
                          </div>
                        </div>

                        {t.defects.length > 0 && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            {t.defects.map((d) => (
                              <a
                                key={d.number}
                                href={d.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`px-2 py-0.5 rounded text-[11px] border ${
                                  d.state === "open"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-green-50 text-green-700 border-green-200"
                                }`}
                              >
                                #{d.number} {d.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-600">No tests match current filters.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Gaps Section */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded p-4">
          <div className="text-sm font-semibold mb-2">Stories without tests</div>
          {data.gaps.storiesWithoutTests.length > 0 ? (
            <ul className="text-sm list-disc ml-5 space-y-1">
              {data.gaps.storiesWithoutTests.map((n) => (
                <li key={n}>Story #{n}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-600">No gaps.</div>
          )}
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-sm font-semibold mb-2">Test cases without story</div>
          {data.gaps.testCasesWithoutStory.length > 0 ? (
            <ul className="text-sm list-disc ml-5 space-y-1">
              {data.gaps.testCasesWithoutStory.map((p) => (
                <li key={p}><code>{p}</code></li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-600">No gaps.</div>
          )}
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-sm font-semibold mb-2">Defects without links</div>
          {data.gaps.defectsWithoutLink.length > 0 ? (
            <ul className="text-sm list-disc ml-5 space-y-1">
              {data.gaps.defectsWithoutLink.map((n) => (
                <li key={n}>Defect #{n}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-600">No gaps.</div>
          )}
        </div>
      </div>

      {/* Drill-down Side Panel */}
      {selectedStory && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex justify-end z-50"
          role="dialog"
          aria-modal="true"
          onClick={closeStoryDetails}
        >
          <div
            className="bg-white w-full sm:w-[520px] max-w-[90vw] h-full overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-4 border-b">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <a
                    href={selectedStory.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {selectedStory.key}
                  </a>
                  <span className="text-gray-700">{selectedStory.title}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedStory.labels?.map((l) => (
                    <span
                      key={l.name}
                      className="px-2 py-0.5 rounded text-[11px] border"
                      style={{
                        backgroundColor: `#${l.color}`,
                        color: parseInt(l.color || "000000", 16) > 0xffffff / 2 ? "#000" : "#fff",
                        borderColor: `#${l.color}`,
                      }}
                    >
                      {l.name}
                    </span>
                  ))}
                  {selectedStory.milestone && (
                    <span className="px-2 py-0.5 rounded text-[11px] bg-purple-50 text-purple-700 border border-purple-200">
                      {selectedStory.milestone}
                    </span>
                  )}
                  {selectedStory.assignees?.slice(0, 5).map((a) => (
                    <span key={a} className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800 border border-blue-300">
                      @{a}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={closeStoryDetails}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close details"
              >
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded p-3 text-center">
                  <div className="text-xs text-gray-600">Tests</div>
                  <div className="text-xl font-semibold">{selectedStory.metrics.testCount}</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-xs text-gray-600">Pass / Fail</div>
                  <div className="text-xl font-semibold text-green-700 inline-block mr-2">{selectedStory.metrics.pass}</div>
                  <div className="text-xl font-semibold text-red-700 inline-block">{selectedStory.metrics.fail}</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-xs text-gray-600">Coverage</div>
                  <div className="text-xl font-semibold">{selectedStory.metrics.coveragePercent}%</div>
                </div>
              </div>

              {/* Tests list */}
              <div className="border rounded">
                <div className="px-3 py-2 border-b text-sm font-semibold bg-gray-50">Tests</div>
                <div className="p-3 space-y-2">
                  {selectedStory.tests.length ? (
                    selectedStory.tests.map((t) => (
                      <div key={t.path} className="border rounded p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <a href={t.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-medium">
                              {t.title}
                            </a>
                            <div className="text-xs text-gray-500 truncate"><code>{t.path}</code></div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {t.assigned_to && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800 border border-blue-300">
                                @{t.assigned_to}
                              </span>
                            )}
                            {t.suite && (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700 border">{t.suite}</span>
                            )}
                            {t.priority && (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800 border border-amber-200">{t.priority}</span>
                            )}
                            {t.latestRun ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] border ${
                                  t.latestRun.result === "pass"
                                    ? "bg-green-100 text-green-800 border-green-300"
                                    : t.latestRun.result === "fail"
                                    ? "bg-red-100 text-red-800 border-red-300"
                                    : "bg-gray-100 text-gray-700 border-gray-300"
                                }`}
                              >
                                {t.latestRun.result.toUpperCase()} by @{t.latestRun.executed_by}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700 border">NO RUN</span>
                            )}
                          </div>
                        </div>
                        {t.defects.length > 0 && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            {t.defects.map((d) => (
                              <a
                                key={d.number}
                                href={d.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`px-2 py-0.5 rounded text-[11px] border ${
                                  d.state === "open" ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"
                                }`}
                              >
                                #{d.number} {d.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-600">No tests available.</div>
                  )}
                </div>
              </div>

              {/* Defects list */}
              <div className="border rounded">
                <div className="px-3 py-2 border-b text-sm font-semibold bg-gray-50">Defects</div>
                <div className="p-3 space-y-2">
                  {selectedStory.defects.length ? (
                    selectedStory.defects.map((d) => (
                      <a
                        key={d.number}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`block px-3 py-2 rounded border ${
                          d.state === "open" ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"
                        }`}
                      >
                        <span className="font-mono">#{d.number}</span> {d.title}
                      </a>
                    ))
                  ) : (
                    <div className="text-sm text-gray-600">No defects linked.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
