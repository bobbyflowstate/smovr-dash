import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/users - Get current user and team info
export async function GET() {
  try {
    // 🔐 Server-side authentication validation
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIdentifier = getUserIdentifier(claims);
    const userName = extractDisplayName(claims);
    const logtoUserId = claims.sub;

    if (!userIdentifier) {
      return NextResponse.json({ error: 'User identifier required' }, { status: 400 });
    }

    console.log('API: Getting user info for:', userIdentifier);

    // 🔒 Ensure user exists and get team info
    await convex.mutation(api.users.getOrCreateUserByEmail, {
      email: userIdentifier,
      name: userName,
      logtoUserId,
    });

    // Get user with team info
    const userInfo = await convex.query(api.users.getUserWithTeam, { 
      userEmail: userIdentifier 
    });

    return NextResponse.json({
      userName: userInfo?.userName || userName, // Use Convex name, fallback to Logto name
      userEmail: userIdentifier,
      teamName: userInfo?.teamName || "Unknown Team",
      teamId: userInfo?.teamId,
      userId: userInfo?.userId
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
