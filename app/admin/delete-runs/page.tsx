"use client";

import { useState, useEffect } from "react";

type Run = {
  path: string;
  name: string;
  timestamp: string;
  date?: string;
  sha?: string;
};

export default function DeleteRunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchRuns();
  }, []);

  async function fetchRuns() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/delete-runs");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch runs");
      }
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRun(runPath: string, updateLatest: boolean = true) {
    if (!confirm(`Are you sure you want to delete this run?\n\n${runPath}`)) {
      return;
    }

    setDeleting(runPath);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/delete-runs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runPath, updateLatest }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete run");
      }

      setSuccess(`Successfully deleted: ${runPath}`);
      // Refresh the list
      await fetchRuns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  const filteredRuns = runs.filter((run) =>
    run.path.toLowerCase().includes(filter.toLowerCase())
  );

  const groupedRuns = filteredRuns.reduce((acc, run) => {
    const testPath = run.path
      .replace(/^qa-runs\//, "")
      .replace(/\/run-\d+\.json$/, "");
    if (!acc[testPath]) {
      acc[testPath] = [];
    }
    acc[testPath].push(run);
    return acc;
  }, {} as Record<string, Run[]>);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Delete Test Runs</h1>
        <p className="text-gray-600">
          View and delete test run files from the repository. This will permanently remove run history.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <strong>Success:</strong> {success}
        </div>
      )}

      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Filter by test path..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button
          onClick={fetchRuns}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {loading && runs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Loading runs...</div>
      ) : Object.keys(groupedRuns).length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {filter ? "No runs match your filter" : "No test runs found"}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedRuns).map(([testPath, testRuns]) => (
            <div key={testPath} className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-800">{testPath}</h3>
                <p className="text-sm text-gray-600">{testRuns.length} run(s)</p>
              </div>
              <div className="divide-y">
                {testRuns.map((run) => {
                  const date = run.date
                    ? new Date(run.date)
                    : new Date(parseInt(run.timestamp));
                  const isDeleting = deleting === run.path;

                  return (
                    <div
                      key={run.path}
                      className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="font-mono text-sm text-gray-700">
                          {run.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {date.toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteRun(run.path, true)}
                        disabled={isDeleting}
                        className="ml-4 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isDeleting ? (
                          <>
                            <svg
                              className="animate-spin h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            Deleting...
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            Delete
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Warning</h4>
        <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
          <li>Deleting runs is permanent and cannot be undone</li>
          <li>The latest.json index will be automatically updated after deletion</li>
          <li>If all runs are deleted, the test will show as "no run" in the traceability matrix</li>
          <li>Deletions commit directly to the main branch</li>
        </ul>
      </div>
    </div>
  );
}
