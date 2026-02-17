import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../logto';
import PatientsClient from './PatientsClient';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import Link from 'next/link';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export default async function PatientsWrapper() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  if (!isAuthenticated || !claims) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 max-w-md text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            You must be logged in to view patients.
          </p>
          <div className="flex flex-col gap-3">
            <Link 
              href="/sign-in" 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Log in
            </Link>
            <Link 
              href="/" 
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Get user info from Logto claims
  const userIdentifier = getUserIdentifier(claims);
  const name = extractDisplayName(claims);
  const logtoUserId = claims.sub;

  if (!userIdentifier) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            User Identifier Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Unable to get a user identifier from your account. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  // Ensure user exists in Convex
  try {
    await convex.mutation(api.users.getOrCreateUserByEmail, {
      email: userIdentifier,
      name,
      logtoUserId,
    });
  } catch (error) {
    console.error('PatientsWrapper: Error ensuring user exists:', error);
  }

  return <PatientsClient />;
}
