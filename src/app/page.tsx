import { getLogtoContext, signIn, signOut } from '@logto/next/server-actions';
import SignIn from './sign-in';
import SignOut from './sign-out';
import { logtoConfig } from './logto';
import Link from 'next/link';
import { extractDisplayName } from '@/lib/auth-utils';

export default async function Home() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  // Fetch user and team info from Convex database
  let userName = extractDisplayName(claims);
  let teamName: string | null = null;
  
  if (isAuthenticated) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = cookies();
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/users`, {
        headers: {
          'Cookie': cookieStore.toString()
        }
      });
      
      if (response.ok) {
        const userInfo = await response.json();
        userName = userInfo.userName;
        teamName = userInfo.teamName;
      }
    } catch (error) {
      console.error('Home: Error fetching user info:', error);
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                Schedule and manage patient appointments with ease
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
                Submit and process patient information securely
              </p>
            </Link>
            
            <Link 
              href="/logs" 
              className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:-translate-y-1"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg mb-4 group-hover:bg-purple-200 dark:group-hover:bg-purple-800 transition-colors">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Logs
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                View system logs and audit trail information
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
                Welcome to SMOVR
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Secure healthcare data management platform
              </p>
            </div>
            <div className="mt-8">
              <SignIn
                onSignIn={async () => {
                  'use server';
                  await signIn(logtoConfig);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
