import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">GTMD</h1>
          <p className="text-xl text-gray-600 mb-4">
            GitHub Test Management Dashboard
          </p>
          <p className="text-gray-500 max-w-md mx-auto">
            Lightweight test management integrated with GitHub for stories, test
            cases, defects, and reporting.
          </p>
        </div>

        {/* Sign-in Options */}
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-4 text-center">Get Started</h2>
            
            {/* Primary: GitHub Sign-in */}
            <a
              href="/api/auth/signin"
              className="block w-full bg-blue-600 text-white px-6 py-3 rounded-lg text-center font-medium hover:bg-blue-700 transition-colors mb-4"
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in with GitHub
              </div>
            </a>

            <div className="text-center text-sm text-gray-500 mb-4 space-y-1">
              <div>Requires GitHub account and repository access</div>
              <a
                href="/api/auth/signin/github?prompt=select_account"
                className="text-blue-600 hover:underline"
              >
                Sign in with a different GitHub account
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or</span>
            </div>
          </div>

          {/* Demo Mode */}
          <div>
            <Link
              href="/dashboard?demo=true"
              className="block w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg text-center font-medium hover:bg-gray-200 transition-colors border border-gray-300"
            >
              Try Demo Mode
            </Link>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Explore with sample data • No sign-in required • Read-only
            </p>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Need Help Getting Started?
          </h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">1.</span>
              <span><strong>New to GTMD?</strong> Try demo mode first to explore the interface</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">2.</span>
              <span><strong>Student?</strong> Ask your instructor for repository access and sign-in instructions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold">3.</span>
              <span><strong>Setting up your own?</strong> See the <a href="/docs/student-setup-guide.md" className="text-blue-600 hover:underline">Student Setup Guide</a></span>
            </li>
          </ul>
        </div>

        {/* Quick Links */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <a href="https://github.com/nastradacha/gtmd" target="_blank" rel="noreferrer" className="hover:text-blue-600">
            View on GitHub
          </a>
          <span className="mx-2">•</span>
          <a href="/docs/student-setup-guide.md" className="hover:text-blue-600">
            Setup Guide
          </a>
          <span className="mx-2">•</span>
          <a href="/docs/test-case-schema.md" className="hover:text-blue-600">
            Documentation
          </a>
        </div>
      </div>
    </div>
  );
}
