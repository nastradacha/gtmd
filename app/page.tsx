import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">GTMD</h1>
        <p className="text-xl text-gray-600 mb-8">
          GitHub Test Management Dashboard
        </p>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          Lightweight test management integrated with GitHub for stories, test
          cases, defects, and reporting.
        </p>
        <a
          href="/api/auth/signin"
          className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}
