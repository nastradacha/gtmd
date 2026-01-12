"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavUser = {
  login: string;
  avatar_url: string;
};

export default function Navigation() {
  const pathname = usePathname();
  const [user, setUser] = useState<NavUser | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectLoading, setProjectLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Fetch user info to show in nav
    fetch("/api/github/me")
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    setProjectLoading(true);
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setProjects(Array.isArray(data.projects) ? data.projects : []);
        setSelectedProjectId(String(data.selectedProjectId || data.activeProject?.id || ""));
      })
      .catch(() => {})
      .finally(() => setProjectLoading(false));
  }, [user]);

  async function changeProject(projectId: string) {
    setSelectedProjectId(projectId);
    try {
      setProjectLoading(true);
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
    } finally {
      setProjectLoading(false);
    }
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/stories", label: "Stories" },
    { href: "/testcases", label: "Test Cases" },
    { href: "/runs", label: "Runs" },
    { href: "/defects", label: "Defects" },
    { href: "/traceability", label: "Traceability" },
    { href: "/activity", label: "Activity" },
    { href: "/my-work", label: "My Work" },
    { href: "/reports", label: "Reports" },
    { href: "/ceremonies", label: "Ceremonies" },
  ];

  return (
    <nav className="bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center">
              <span className="text-2xl font-bold text-blue-600">GTMD</span>
            </Link>

            <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    pathname === item.href
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {user && projects.length > 1 && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-gray-500">Project</span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => changeProject(e.target.value)}
                  disabled={projectLoading}
                  className="border rounded px-2 py-1 text-sm bg-white"
                  title="Select project"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {user && (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/admin/config"
                  className="text-gray-600 hover:text-gray-900"
                  title="Admin: Config Status"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>
                <Link
                  href="/admin/delete-runs"
                  className="text-gray-600 hover:text-red-600"
                  title="Admin: Delete Test Runs"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>
              </div>
            )}

            {user ? (
              <div className="hidden sm:flex items-center gap-3">
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-sm font-medium text-gray-700">{user.login}</span>
                <Link
                  href="/api/auth/signout"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Sign out
                </Link>
              </div>
            ) : (
              <Link
                href="/api/auth/signin"
                className="hidden sm:inline-flex bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Sign in with GitHub
              </Link>
            )}

            {user && (
              <img
                src={user.avatar_url}
                alt={user.login}
                className="w-8 h-8 rounded-full sm:hidden"
              />
            )}

            <button
              type="button"
              className="sm:hidden inline-flex items-center justify-center p-2 rounded-md border text-gray-700 hover:bg-gray-50"
              aria-controls="mobile-menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              title="Menu"
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div id="mobile-menu" className="sm:hidden border-t bg-white">
          <div className="px-3 pt-3 pb-4 space-y-3">
            {user && (
              <div className="flex items-center gap-3 px-1">
                <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full" />
                <div className="text-sm font-medium text-gray-800">{user.login}</div>
              </div>
            )}

            {user && projects.length > 1 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Project</div>
                <select
                  value={selectedProjectId}
                  onChange={(e) => changeProject(e.target.value)}
                  disabled={projectLoading}
                  className="w-full border rounded px-3 py-2 text-base bg-white"
                  title="Select project"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-3 rounded-md text-base font-medium ${
                    pathname === item.href
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {user && (
              <div className="space-y-1 border-t pt-2">
                <Link
                  href="/admin/config"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50"
                >
                  Admin: Config Status
                </Link>
                <Link
                  href="/admin/delete-runs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50"
                >
                  Admin: Delete Test Runs
                </Link>
              </div>
            )}

            <div className="border-t pt-2">
              {user ? (
                <Link
                  href="/api/auth/signout"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50"
                >
                  Sign out
                </Link>
              ) : (
                <Link
                  href="/api/auth/signin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-3 rounded-md text-base font-medium bg-blue-600 text-white text-center hover:bg-blue-700"
                >
                  Sign in with GitHub
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
