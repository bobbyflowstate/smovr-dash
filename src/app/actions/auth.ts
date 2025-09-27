'use server';

import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../logto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims) {
      console.log('getCurrentUserEmail: User not authenticated or no claims');
      return null;
    }

    console.log('getCurrentUserEmail: Available claims:', Object.keys(claims));
    console.log('getCurrentUserEmail: Claims values:', {
      email: claims.email,
      sub: claims.sub,
      name: claims.name,
      username: claims.username
    });

    // Get email from claims - try different possible email fields
    const userEmail = claims.email || claims.username || null;
    console.log('getCurrentUserEmail: Returning email:', userEmail);
    
    return userEmail;
  } catch (error) {
    console.error('Error getting current user email:', error);
    return null;
  }
}

export async function ensureUserExists(): Promise<{ email: string; userId: string } | null> {
  try {
    console.log('ensureUserExists: Starting...');
    const logtoContext = await getLogtoContext(logtoConfig);
    console.log('ensureUserExists: Logto context:', {
      isAuthenticated: logtoContext.isAuthenticated,
      hasClaims: !!logtoContext.claims,
      claimsKeys: logtoContext.claims ? Object.keys(logtoContext.claims) : []
    });
    
    const { isAuthenticated, claims } = logtoContext;
    
    if (!isAuthenticated || !claims) {
      console.log('ensureUserExists: User not authenticated or no claims', { isAuthenticated, hasClaims: !!claims });
      return null;
    }

    // Get user info from Logto claims
    const email = claims.email || claims.username;
    const name = claims.name || claims.username || 'Unknown User';
    const logtoUserId = claims.sub;

    if (!email) {
      console.error('ensureUserExists: No email found in claims');
      return null;
    }

    console.log('ensureUserExists: Ensuring user exists:', { email, name, logtoUserId });

    // Call Convex mutation to get or create the user
    const userId = await convex.mutation(api.users.getOrCreateUserByEmail, {
      email,
      name,
      logtoUserId,
    });

    console.log('ensureUserExists: User ID:', userId);
    return { email, userId };
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return null;
  }
}
