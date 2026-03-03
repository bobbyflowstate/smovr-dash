import { convexAuthNextjsToken, isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import Link from "next/link";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { globalLogger } from "@/lib/observability";

export default async function Home() {
  const isAuthenticated = await isAuthenticatedNextjs();

  // Fetch user and team info from Convex database
  let userName = "User";
  let teamName: string | null = null;

  if (isAuthenticated) {
    try {
      const token = await convexAuthNextjsToken();
      if (token) {
        // Ensure team exists for the authenticated user
        await fetchMutation(api.users.ensureTeam, {}, { token });

        // Get user with team info
        const userInfo = await fetchQuery(api.users.currentUser, {}, { token });

        if (userInfo) {
          userName = userInfo.userName || userName;
          teamName = userInfo.teamName || "Unknown Team";
        }
      }
    } catch (error) {
      globalLogger.error("Home: Error fetching user info", error);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {isAuthenticated ? (
        // Authenticated user sees the dashboard
        <div className="container mx-auto px-4 py-8">
          {/* Welcome Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-8 transition-colors">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                {teamName ? `Welcome to ${teamName}` : "Welcome"}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Hello, {userName}! Ready to manage your team and customer data.
              </p>
            </div>
          </div>

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <Link 
              href="/appointments" 
              className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:-translate-y-1"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg mb-4 group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Appointments
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Schedule and manage patient appointments
              </p>
            </Link>
            
            <Link 
              href="/submit" 
              className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:-translate-y-1"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg mb-4 group-hover:bg-green-200 dark:group-hover:bg-green-800 transition-colors">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Submit
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Submit patient information securely
              </p>
            </Link>

            <Link 
              href="/patients" 
              className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:-translate-y-1"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg mb-4 group-hover:bg-orange-200 dark:group-hover:bg-orange-800 transition-colors">
                <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Patients
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Manage patient records and history
              </p>
            </Link>

            <Link 
              href="/messages" 
              className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:-translate-y-1"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-teal-100 dark:bg-teal-900 rounded-lg mb-4 group-hover:bg-teal-200 dark:group-hover:bg-teal-800 transition-colors">
                <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Messages
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Two-way SMS with patients
              </p>
            </Link>
            
            <Link 
              href="/audit-logs" 
              className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:-translate-y-1"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg mb-4 group-hover:bg-purple-200 dark:group-hover:bg-purple-800 transition-colors">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Audit Logs
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Track patient responses to appointment notifications
              </p>
            </Link>
          </div>
        </div>
      ) : (
        // Unauthenticated user sees the login page
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Welcome to AZ Integrated Medical (Yuma)
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Secure healthcare data management platform
              </p>
            </div>
            <div className="mt-8">
              <Link
                href="/sign-in"
                className="w-full flex justify-center items-center gap-2 py-3 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-white dark:focus:ring-offset-gray-800 hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
