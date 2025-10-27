import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../logto';
import AppointmentsClient from './AppointmentsClient';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export default async function AppointmentsWrapper() {
  console.log('AppointmentsWrapper: Getting Logto context...');
  
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  
  console.log('AppointmentsWrapper: Logto context:', {
    isAuthenticated,
    hasClaims: !!claims,
    claimsKeys: claims ? Object.keys(claims) : []
  });

  if (!isAuthenticated || !claims) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Authentication Required</h1>
          <p className="text-gray-600 dark:text-gray-400">
            You must be logged in to view appointments. Please log in and try again.
          </p>
        </div>
      </div>
    );
  }

  // Get user info from Logto claims using utility functions
  const userIdentifier = getUserIdentifier(claims);
  const name = extractDisplayName(claims);
  const logtoUserId = claims.sub;

  console.log('AppointmentsWrapper: User info:', { 
    userIdentifier, 
    name, 
    logtoUserId,
    hasEmail: !!claims.email,
    hasUsername: !!claims.username 
  });

  if (!userIdentifier) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">User Identifier Required</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Unable to get a user identifier from your account. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  // Get team name directly from Convex
  let teamName = "Unknown Team";
  
  try {
    // Ensure user exists in Convex
    await convex.mutation(api.users.getOrCreateUserByEmail, {
      email: userIdentifier,
      name,
      logtoUserId,
    });

    // Get user with team info
    const userInfo = await convex.query(api.users.getUserWithTeam, { 
      userEmail: userIdentifier 
    });

    if (userInfo) {
      teamName = userInfo.teamName || "Unknown Team";
    }
  } catch (error) {
    console.error('AppointmentsWrapper: Error fetching team info:', error);
  }

  return (
    <AppointmentsClient 
      userName={name}
      teamName={teamName}
    />
  );
}
