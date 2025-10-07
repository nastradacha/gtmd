"use client";

import { useEffect, useMemo, useState } from "react";

type Summary = {
  totals: { testcases: number; latest_pass: number; latest_fail: number; no_runs: number };
  byFolder: Record<string, { count: number; pass: number; fail: number; no_runs: number }>;
  failures: Array<{ path: string; folder: string; result: string; executed_at: string }>;
};

export default function ReportsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/reports/summary", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as Summary;
        setData(json);
      } catch (e: any) {
        setError(e.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const folders = useMemo(() => {
    const entries = Object.entries(data?.byFolder || {});
    return entries.sort((a, b) => b[1].count - a[1].count);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">Loading reports...</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <div className="text-gray-600 text-sm mt-1">Test health summary and folder breakdown</div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Test Cases" value={data.totals.testcases} />
            <MetricCard label="Latest PASS" value={data.totals.latest_pass} tone="success" />
            <MetricCard label="Latest FAIL" value={data.totals.latest_fail} tone="danger" />
            <MetricCard label="No Runs" value={data.totals.no_runs} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="border rounded-lg p-4">
              <h2 className="font-semibold text-lg mb-3">By Folder</h2>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-2">Folder</th>
                      <th className="py-2 pr-2">Count</th>
                      <th className="py-2 pr-2">Pass</th>
                      <th className="py-2 pr-2">Fail</th>
                      <th className="py-2 pr-2">No runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folders.map(([folder, m]) => (
                      <tr key={folder} className="border-t">
                        <td className="py-2 pr-2 font-medium">{folder}</td>
                        <td className="py-2 pr-2">{m.count}</td>
                        <td className="py-2 pr-2 text-green-700">{m.pass}</td>
                        <td className="py-2 pr-2 text-red-700">{m.fail}</td>
                        <td className="py-2 pr-2">{m.no_runs}</td>
                      </tr>
                    ))}
                    {folders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-gray-500 text-center">No data</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="border rounded-lg p-4">
              <h2 className="font-semibold text-lg mb-3">Recent Failures</h2>
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {data.failures.map((f, idx) => (
                  <div key={idx} className="border rounded p-3 bg-white">
                    <div className="text-sm font-medium">{f.path}</div>
                    <div className="text-xs text-gray-600 mt-1">Folder: {f.folder}</div>
                    <div className="text-xs mt-1">
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full border bg-red-100 text-red-800 border-red-300">{String(f.result).toUpperCase()}</span>
                      <span className="ml-2 text-gray-600">at {new Date(f.executed_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {data.failures.length === 0 && (
                  <div className="text-gray-500 text-sm">No recent failures</div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-green-700" : tone === "danger" ? "text-red-700" : "text-gray-800";
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
