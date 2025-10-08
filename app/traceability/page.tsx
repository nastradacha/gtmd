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

export default function TraceabilityPage() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState("");
  const [suiteFilter, setSuiteFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch("/api/traceability/matrix")
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (mounted) setData(json);
      })
      .catch((e) => setError(e.message || "Failed to load matrix"))
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

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
      if (s.tests.length === 0) {
        const row = [
          s.number,
          s.key,
          s.title,
          s.url,
          assigneesStr,
          labelsStr,
          s.milestone || "",
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
        <h1 className="text-3xl font-bold mb-4">Traceability</h1>

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
          <div className="text-sm text-gray-600">
            Showing {filteredStories.length} of {data.stories.length} stories
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
      </div>

      {/* Matrix Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 bg-gray-50 border-b px-4 py-2 text-sm font-semibold">
          <div className="col-span-4">Story</div>
          <div className="col-span-3">Tests</div>
          <div className="col-span-3">Defects</div>
          <div className="col-span-2">Coverage</div>
        </div>
        {filteredStories.map((s) => (
          <div key={s.number} className="border-b">
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
        ))}
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
    </div>
  );
}
