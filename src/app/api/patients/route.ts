import { NextRequest, NextResponse } from 'next/server';
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '@/app/logto';
import { getUserIdentifier } from '@/lib/auth-utils';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

/**
 * GET /api/patients - List all patients for the user's team
 * GET /api/patients?id=xxx - Get a single patient with history
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userEmail = getUserIdentifier(claims);
    if (!userEmail) {
      return NextResponse.json({ error: 'User email not found' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('id');
    
    if (patientId) {
      // Get single patient with history
      const patient = await convex.query(api.patients.getWithHistory, {
        userEmail,
        patientId: patientId as Id<"patients">,
      });
      
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      
      return NextResponse.json(patient);
    } else {
      // List all patients
      const patients = await convex.query(api.patients.listForTeam, { userEmail });
      return NextResponse.json(patients);
    }
  } catch (error) {
    console.error('Error fetching patients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patients' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/patients - Create a new patient
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userEmail = getUserIdentifier(claims);
    if (!userEmail) {
      return NextResponse.json({ error: 'User email not found' }, { status: 401 });
    }
    
    const body = await request.json();
    const { name, phone, notes, birthday } = body;
    
    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Name and phone are required' },
        { status: 400 }
      );
    }
    
    const result = await convex.mutation(api.patients.create, {
      userEmail,
      name,
      phone,
      notes,
      birthday,
    });
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating patient:', error);
    const message = error instanceof Error ? error.message : 'Failed to create patient';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/patients - Update a patient
 */
export async function PATCH(request: NextRequest) {
  try {
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userEmail = getUserIdentifier(claims);
    if (!userEmail) {
      return NextResponse.json({ error: 'User email not found' }, { status: 401 });
    }
    
    const body = await request.json();
    const { patientId, name, phone, notes, birthday } = body;
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }
    
    await convex.mutation(api.patients.update, {
      userEmail,
      patientId: patientId as Id<"patients">,
      name,
      phone,
      notes,
      birthday,
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating patient:', error);
    const message = error instanceof Error ? error.message : 'Failed to update patient';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/patients - Delete a patient
 */
export async function DELETE(request: NextRequest) {
  try {
    const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
    
    if (!isAuthenticated || !claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userEmail = getUserIdentifier(claims);
    if (!userEmail) {
      return NextResponse.json({ error: 'User email not found' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('id');
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }
    
    await convex.mutation(api.patients.remove, {
      userEmail,
      patientId: patientId as Id<"patients">,
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting patient:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete patient';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
