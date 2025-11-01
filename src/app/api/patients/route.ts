import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// GET /api/patients - Get team's patients for autocomplete (authenticated)
export async function GET() {
  try {
    // 🔐 Server-side authentication validation
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = claims.email;
    
    console.log('API: Getting patients for user:', userEmail);

    // Get user to find their teamId
    const user = await convex.query(api.users.getUserWithTeam, { 
      userEmail 
    });

    // If user doesn't exist or has no team yet, return empty array
    if (!user || !user.teamId) {
      console.log('User has no team yet, returning empty patients');
      return NextResponse.json([]);
    }

    // 🔒 Get patients for user's team only
    const patients = await convex.query(api.patients.getByTeam, { 
      teamId: user.teamId as Id<"teams">
    });

    return NextResponse.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}



