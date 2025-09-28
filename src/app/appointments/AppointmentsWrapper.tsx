import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../logto';
import AppointmentsClient from './AppointmentsClient';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';

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

  // Get team name via authenticated API route
  let teamName = "Unknown Team";
  
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
      teamName = userInfo.teamName;
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
