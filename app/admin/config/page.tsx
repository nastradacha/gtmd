"use client";

import { useEffect, useState } from "react";

interface ConfigStatus {
  key: string;
  required: boolean;
  configured: boolean;
  value?: string;
  error?: string;
  description: string;
}

export default function ConfigStatusPage() {
  const [config, setConfig] = useState<ConfigStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [allValid, setAllValid] = useState(false);

  useEffect(() => {
    fetchConfigStatus();
  }, []);

  async function fetchConfigStatus() {
    try {
      const res = await fetch("/api/admin/config/status");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setAllValid(data.allValid);
      }
    } catch (err) {
      console.error("Failed to fetch config status:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-4">Configuration Status</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const requiredConfigs = config.filter((c) => c.required);
  const optionalConfigs = config.filter((c) => !c.required);
  const missingRequired = requiredConfigs.filter((c) => !c.configured);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Environment Configuration</h1>
      <p className="text-gray-600 mb-6">
        Check the status of your GTMD environment variables and GitHub integration
      </p>

      {/* Overall Status */}
      <div
        className={`rounded-lg p-6 mb-6 border-2 ${
          allValid
            ? "bg-green-50 border-green-300"
            : "bg-red-50 border-red-300"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`text-4xl ${
              allValid ? "text-green-600" : "text-red-600"
            }`}
          >
            {allValid ? "✓" : "✗"}
          </div>
          <div>
            <h2 className="text-xl font-semibold">
              {allValid ? "Configuration Valid" : "Configuration Incomplete"}
            </h2>
            <p className="text-sm text-gray-700">
              {allValid
                ? "All required environment variables are configured correctly."
                : `${missingRequired.length} required configuration${
                    missingRequired.length !== 1 ? "s" : ""
                  } missing or invalid.`}
            </p>
          </div>
        </div>
      </div>

      {/* Missing Required Configs Alert */}
      {missingRequired.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Action Required</h3>
          <p className="text-sm text-yellow-800 mb-2">
            The following required environment variables are not configured:
          </p>
          <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
            {missingRequired.map((item) => (
              <li key={item.key}>
                <strong>{item.key}</strong>: {item.description}
              </li>
            ))}
          </ul>
          <div className="mt-3 text-sm text-yellow-800">
            <strong>To fix:</strong> Add these variables to your <code>.env.local</code> file.
            See <code>.env.example</code> for template.
          </div>
        </div>
      )}

      {/* Required Configuration */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Required Configuration</h2>
        <div className="space-y-3">
          {requiredConfigs.map((item) => (
            <ConfigItem key={item.key} config={item} />
          ))}
        </div>
      </div>

      {/* Optional Configuration */}
      {optionalConfigs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Optional Configuration</h2>
          <div className="space-y-3">
            {optionalConfigs.map((item) => (
              <ConfigItem key={item.key} config={item} />
            ))}
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
        <h3 className="font-semibold text-blue-900 mb-3">📘 Setup Instructions</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>Step 1:</strong> Copy <code>.env.example</code> to <code>.env.local</code>
          </p>
          <p>
            <strong>Step 2:</strong> Create a GitHub OAuth App at{" "}
            <a
              href="https://github.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-600"
            >
              GitHub Developer Settings
            </a>
          </p>
          <p>
            <strong>Step 3:</strong> Fill in your <code>GITHUB_ID</code> and{" "}
            <code>GITHUB_SECRET</code>
          </p>
          <p>
            <strong>Step 4:</strong> Set your repositories: <code>STORIES_REPO</code> and{" "}
            <code>TESTCASES_REPO</code>
          </p>
          <p>
            <strong>Step 5:</strong> Generate <code>NEXTAUTH_SECRET</code> with:{" "}
            <code className="bg-blue-100 px-1 rounded">openssl rand -base64 32</code>
          </p>
          <p>
            <strong>Step 6:</strong> Restart your development server
          </p>
        </div>
      </div>

      {/* Documentation Link */}
      <div className="text-center mt-6">
        <a
          href="https://github.com/nastradacha/gtmd/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm"
        >
          View Full Documentation →
        </a>
      </div>
    </div>
  );
}

function ConfigItem({ config }: { config: ConfigStatus }) {
  const { key, required, configured, value, error, description } = config;

  return (
    <div
      className={`border rounded-lg p-4 ${
        configured
          ? "bg-white border-gray-200"
          : required
          ? "bg-red-50 border-red-300"
          : "bg-gray-50 border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-sm font-mono font-semibold">{key}</code>
            {required && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                REQUIRED
              </span>
            )}
            {configured ? (
              <span className="text-green-600 text-xl">✓</span>
            ) : (
              <span className="text-red-600 text-xl">✗</span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-2">{description}</p>
          {configured && value && (
            <p className="text-xs text-gray-500 font-mono bg-gray-100 p-2 rounded">
              {value}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 mt-2">
              <strong>Error:</strong> {error}
            </p>
          )}
          {!configured && !error && (
            <p className="text-sm text-gray-500 italic">Not configured</p>
          )}
        </div>
      </div>
    </div>
  );
}
