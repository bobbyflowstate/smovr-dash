import Link from 'next/link';
import { getLogtoContext, signOut } from '@logto/next/server-actions';
import { logtoConfig } from '../app/logto';
import SignOut from '../app/sign-out';
import ClientHeader from '@/components/ClientHeader';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export default async function Header() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  if (!isAuthenticated) {
    return null; // Don't show header if not authenticated
  }

  // Fetch user name, team name, and team ID from Convex database
  let userName = extractDisplayName(claims); // Fallback to Logto claims
  let teamId: string | null = null;
  let teamName: string | null = null;
  
  if (claims) {
    try {
      const userEmail = getUserIdentifier(claims);
      const logtoUserId = claims.sub;

      if (userEmail) {
        // Ensure user exists in Convex
        await convex.mutation(api.users.getOrCreateUserByEmail, {
          email: userEmail,
          name: userName,
          logtoUserId,
        });

        // Get user with team info
        const userInfo = await convex.query(api.users.getUserWithTeam, { 
          userEmail 
        });

        if (userInfo) {
          userName = userInfo.userName || userName;
          teamId = userInfo.teamId;
          teamName = userInfo.teamName || null;
        }
      }
    } catch (error) {
      console.error('Header: Error fetching user info:', error);
      // userName remains as fallback value
    }
  }

  return (
    <ClientHeader 
      userName={userName}
      teamId={teamId}
      teamName={teamName}
      onSignOut={async () => {
        'use server';
        await signOut(logtoConfig);
      }}
    />
  );
}
