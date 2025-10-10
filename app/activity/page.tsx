"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ActivityRun {
  path: string;
  storyId: string | null;
  result: string;
  notes: string;
  executed_by: string;
  executed_at: string;
  test_case_path: string;
  run_file: string;
  timestamp: number;
}

export default function ActivityPage() {
  const [runs, setRuns] = useState<ActivityRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [filterResult, setFilterResult] = useState<string>("all");
  const [filterTester, setFilterTester] = useState<string>("");
  const [dateRange, setDateRange] = useState<string>("week");

  useEffect(() => {
    fetchActivity();
  }, [limit, dateRange]);

  async function fetchActivity() {
    try {
      setLoading(true);
      setError(null);

      let since = "";
      if (dateRange === "day") {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        since = d.toISOString();
      } else if (dateRange === "week") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        since = d.toISOString();
      } else if (dateRange === "month") {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        since = d.toISOString();
      }

      const params = new URLSearchParams({ limit: String(limit) });
      if (since) params.set("since", since);

      const res = await fetch(`/api/github/testcases/activity?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch activity");

      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    const headers = [
      "test_case",
      "result",
      "executed_by",
      "executed_at",
      "story_id",
      "notes",
    ];
    const rows: string[] = [headers.join(",")];

    const filteredData = getFilteredRuns();
    for (const r of filteredData) {
      const row = [
        `"${r.test_case_path}"`,
        r.result,
        r.executed_by,
        r.executed_at,
        r.storyId || "",
        `"${(r.notes || "").replace(/"/g, '""')}"`,
      ];
      rows.push(row.join(","));
    }

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `test-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getFilteredRuns() {
    return runs.filter((r) => {
      if (filterResult !== "all" && r.result.toLowerCase() !== filterResult) return false;
      if (filterTester && !r.executed_by.toLowerCase().includes(filterTester.toLowerCase())) return false;
      return true;
    });
  }

  const filteredRuns = getFilteredRuns();

  // Group by tester for stats
  const testerStats = runs.reduce((acc, r) => {
    const tester = r.executed_by;
    if (!acc[tester]) {
      acc[tester] = { pass: 0, fail: 0, total: 0 };
    }
    acc[tester].total++;
    if (r.result.toLowerCase() === "pass") acc[tester].pass++;
    if (r.result.toLowerCase() === "fail") acc[tester].fail++;
    return acc;
  }, {} as Record<string, { pass: number; fail: number; total: number }>);

  const uniqueTesters = Object.keys(testerStats).sort();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Test Execution Activity</h1>
          <p className="text-gray-600 text-sm mt-1">
            Recent test executions across all test cases
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
          disabled={filteredRuns.length === 0}
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Time Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="day">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Result</label>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="pass">Pass only</option>
              <option value="fail">Fail only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tester</label>
            <input
              type="text"
              value={filterTester}
              onChange={(e) => setFilterTester(e.target.value)}
              placeholder="Filter by tester..."
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Limit</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="25">25 runs</option>
              <option value="50">50 runs</option>
              <option value="100">100 runs</option>
              <option value="200">200 runs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-600">Total Executions</div>
          <div className="text-2xl font-bold">{filteredRuns.length}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <div className="text-sm text-green-700">Passed</div>
          <div className="text-2xl font-bold text-green-800">
            {filteredRuns.filter((r) => r.result.toLowerCase() === "pass").length}
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <div className="text-sm text-red-700">Failed</div>
          <div className="text-2xl font-bold text-red-800">
            {filteredRuns.filter((r) => r.result.toLowerCase() === "fail").length}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <div className="text-sm text-blue-700">Active Testers</div>
          <div className="text-2xl font-bold text-blue-800">{uniqueTesters.length}</div>
        </div>
      </div>

      {/* Tester Leaderboard */}
      {uniqueTesters.length > 0 && (
        <div className="bg-white border rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">Tester Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2 px-3">Tester</th>
                  <th className="text-right py-2 px-3">Total</th>
                  <th className="text-right py-2 px-3">Pass</th>
                  <th className="text-right py-2 px-3">Fail</th>
                  <th className="text-right py-2 px-3">Pass Rate</th>
                </tr>
              </thead>
              <tbody>
                {uniqueTesters.map((tester) => {
                  const stats = testerStats[tester];
                  const passRate = stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : 0;
                  return (
                    <tr key={tester} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">@{tester}</td>
                      <td className="text-right py-2 px-3">{stats.total}</td>
                      <td className="text-right py-2 px-3 text-green-700">{stats.pass}</td>
                      <td className="text-right py-2 px-3 text-red-700">{stats.fail}</td>
                      <td className="text-right py-2 px-3">{passRate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity List */}
      {loading ? (
        <div className="text-center py-12 text-gray-600">Loading activity...</div>
      ) : filteredRuns.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          No test executions found for the selected filters.
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-3 px-4">Time</th>
                  <th className="text-left py-3 px-4">Test Case</th>
                  <th className="text-left py-3 px-4">Result</th>
                  <th className="text-left py-3 px-4">Tester</th>
                  <th className="text-left py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 whitespace-nowrap text-xs text-gray-600">
                      {new Date(run.executed_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/testcases?open=${encodeURIComponent(run.test_case_path)}`}
                        className="text-blue-600 hover:underline font-mono text-xs"
                      >
                        {run.test_case_path.split("/").pop()}
                      </Link>
                      {run.storyId && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          #{run.storyId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          run.result.toLowerCase() === "pass"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {run.result.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4">@{run.executed_by}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 max-w-md truncate">
                      {run.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
