"use client";

import { useEffect, useState } from "react";
import { GitHubIssue, TestCase } from "@/lib/types";

interface CoverageData {
  totalStories: number;
  linkedStories: number;
  coveragePercent: number;
  unlinkedStories: GitHubIssue[];
}

interface DefectStats {
  total: number;
  open: number;
  closed: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export default function DashboardPage() {
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [defectStats, setDefectStats] = useState<DefectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);

    try {
      const [issuesRes, testCasesRes] = await Promise.all([
        fetch("/api/github/issues?state=all"),
        fetch("/api/github/testcases"),
      ]);

      if (!issuesRes.ok) throw new Error("Failed to fetch stories");
      if (!testCasesRes.ok) throw new Error("Failed to fetch test cases");

      const allIssues: GitHubIssue[] = await issuesRes.json();
      const issuesOnly = allIssues.filter((item: any) => !item.pull_request);

      const defects = issuesOnly.filter((d) =>
        d.labels.some((l) => l.name.toLowerCase() === "bug")
      );
      const storiesOnly = issuesOnly.filter(
        (d) => !d.labels.some((l) => l.name.toLowerCase() === "bug")
      );

      const testCases: TestCase[] = await testCasesRes.json();

      // Find linked stories using story_id frontmatter already returned by the testcases endpoint
      const linkedStoryIds = new Set<number>();
      for (const tc of testCases) {
        const raw = (tc as any).story_id;
        if (!raw) continue;
        const m = String(raw).match(/\d+/);
        if (m) linkedStoryIds.add(parseInt(m[0], 10));
      }

      const linkedStories = storiesOnly.filter((story) => linkedStoryIds.has(story.number));
      const unlinkedStories = storiesOnly.filter((story) => !linkedStoryIds.has(story.number));

      setCoverage({
        totalStories: storiesOnly.length,
        linkedStories: linkedStories.length,
        coveragePercent:
          storiesOnly.length > 0
            ? Math.round((linkedStories.length / storiesOnly.length) * 100)
            : 0,
        unlinkedStories,
      });

      const openDefects = defects.filter((d) => d.state === "open");
      const closedDefects = defects.filter((d) => d.state === "closed");

      const bySeverity = {
        critical: defects.filter((d) =>
          d.labels.some((l) => l.name.toLowerCase() === "critical")
        ).length,
        high: defects.filter((d) =>
          d.labels.some((l) => l.name.toLowerCase() === "high")
        ).length,
        medium: defects.filter((d) =>
          d.labels.some((l) => l.name.toLowerCase() === "medium")
        ).length,
        low: defects.filter((d) =>
          d.labels.some((l) => l.name.toLowerCase() === "low")
        ).length,
      };

      setDefectStats({
        total: defects.length,
        open: openDefects.length,
        closed: closedDefects.length,
        bySeverity,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function exportToCSV() {
    if (!coverage || !defectStats) return;

    const csvContent = [
      "GTMD Dashboard Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Coverage Metrics",
      "Total Stories,Linked Stories,Coverage %",
      `${coverage.totalStories},${coverage.linkedStories},${coverage.coveragePercent}%`,
      "",
      "Unlinked Stories",
      "Number,Title,State",
      ...coverage.unlinkedStories.map(
        (s) => `${s.number},"${s.title}",${s.state}`
      ),
      "",
      "Defect Statistics",
      "Total,Open,Closed",
      `${defectStats.total},${defectStats.open},${defectStats.closed}`,
      "",
      "Defects by Severity",
      "Critical,High,Medium,Low",
      `${defectStats.bySeverity.critical},${defectStats.bySeverity.high},${defectStats.bySeverity.medium},${defectStats.bySeverity.low}`,
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gtmd-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <button
          onClick={exportToCSV}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Export to CSV
        </button>
      </div>

      {/* Coverage Section */}
      {coverage && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Test Coverage</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="text-sm text-blue-600 font-medium mb-1">
                Total Stories
              </div>
              <div className="text-4xl font-bold text-blue-900">
                {coverage.totalStories}
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="text-sm text-green-600 font-medium mb-1">
                Linked Stories
              </div>
              <div className="text-4xl font-bold text-green-900">
                {coverage.linkedStories}
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
              <div className="text-sm text-purple-600 font-medium mb-1">
                Coverage
              </div>
              <div className="text-4xl font-bold text-purple-900">
                {coverage.coveragePercent}%
              </div>
            </div>
          </div>

          {/* Coverage Bar */}
          <div className="mb-6">
            <div className="bg-gray-200 rounded-full h-8 overflow-hidden">
              <div
                className="bg-green-500 h-full flex items-center justify-center text-white font-medium text-sm"
                style={{ width: `${coverage.coveragePercent}%` }}
              >
                {coverage.coveragePercent > 10 && `${coverage.coveragePercent}%`}
              </div>
            </div>
          </div>

          {/* Unlinked Stories */}
          {coverage.unlinkedStories.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold mb-3">
                Unlinked Stories ({coverage.unlinkedStories.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {coverage.unlinkedStories.map((story) => (
                  <div
                    key={story.id}
                    className="flex justify-between items-center bg-white p-3 rounded border"
                  >
                    <div>
                      <span className="font-mono text-sm">#{story.number}</span>
                      <span className="ml-2">{story.title}</span>
                    </div>
                    <a
                      href={story.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      View →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Defect Statistics */}
      {defectStats && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Defect Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <div className="text-sm text-gray-600 font-medium mb-1">
                Total Defects
              </div>
              <div className="text-4xl font-bold text-gray-900">
                {defectStats.total}
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="text-sm text-red-600 font-medium mb-1">
                Open Defects
              </div>
              <div className="text-4xl font-bold text-red-900">
                {defectStats.open}
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="text-sm text-green-600 font-medium mb-1">
                Closed Defects
              </div>
              <div className="text-4xl font-bold text-green-900">
                {defectStats.closed}
              </div>
            </div>
          </div>

          {/* Defects by Severity Chart */}
          <div className="bg-white border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Defects by Severity</h3>
            <div className="space-y-3">
              <DefectBar
                label="Critical"
                count={defectStats.bySeverity.critical}
                total={defectStats.total}
                color="bg-red-500"
              />
              <DefectBar
                label="High"
                count={defectStats.bySeverity.high}
                total={defectStats.total}
                color="bg-orange-500"
              />
              <DefectBar
                label="Medium"
                count={defectStats.bySeverity.medium}
                total={defectStats.total}
                color="bg-yellow-500"
              />
              <DefectBar
                label="Low"
                count={defectStats.bySeverity.low}
                total={defectStats.total}
                color="bg-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DefectBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-gray-600">
          {count} ({Math.round(percent)}%)
        </span>
      </div>
      <div className="bg-gray-200 rounded-full h-6 overflow-hidden">
        <div
          className={`${color} h-full flex items-center px-2 text-white text-xs font-medium`}
          style={{ width: `${Math.max(percent, 5)}%` }}
        >
          {percent > 15 && count}
        </div>
      </div>
    </div>
  );
}
