import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../logto';
import SubmitForm from './SubmitForm';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';

export default async function SubmitFormWrapper() {
  console.log('SubmitFormWrapper: Getting Logto context...');
  
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  
  console.log('SubmitFormWrapper: Logto context:', {
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
            You must be logged in to schedule appointments. Please log in and try again.
          </p>
        </div>
      </div>
    );
  }

  // Log all claim values to see what we have
  console.log('SubmitFormWrapper: All claims:', {
    sub: claims.sub,
    name: claims.name,
    username: claims.username,
    email: claims.email,
    picture: claims.picture,
    aud: claims.aud,
    iss: claims.iss
  });

  // Get user info from Logto claims using utility functions
  const userIdentifier = getUserIdentifier(claims);
  const name = extractDisplayName(claims);
  const logtoUserId = claims.sub;

  console.log('SubmitFormWrapper: User info:', { 
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

  return (
    <SubmitForm 
      userEmail={userIdentifier}
      userName={name}
      logtoUserId={logtoUserId}
    />
  );
}
