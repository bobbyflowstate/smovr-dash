import { NextRequest, NextResponse } from 'next/server';
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { safeErrorMessage } from '@/lib/api-utils';
import { runWithContext, createRequestContext, getLogger } from '@/lib/observability';

/**
 * GET /api/patients - List all patients for the user's team
 * GET /api/patients?id=xxx - Get a single patient with history
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'patients.list',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get('id');

      if (patientId) {
        log.info('Fetching patient with history', { patientId });
        const patient = await fetchQuery(api.patients.getWithHistory, {
          userEmail: "",
          patientId: patientId as Id<"patients">,
        }, { token });

        if (!patient) {
          log.warn('Patient not found', { patientId });
          return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
        }

        return NextResponse.json(patient);
      } else {
        log.info('Fetching patients list');
        const patients = await fetchQuery(api.patients.listForTeam, { userEmail: "" }, { token });
        log.info('Fetched patients', { count: patients.length });
        return NextResponse.json(patients);
      }
    } catch (error) {
      log.error('Failed to fetch patients', error);
      return NextResponse.json(
        { error: 'Failed to fetch patients' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/patients - Create a new patient
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'POST',
    route: 'patients.create',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await request.json();
      const { name, phone, notes, birthday } = body;

      if (!name || !phone) {
        log.warn('Missing required fields', { hasName: !!name, hasPhone: !!phone });
        return NextResponse.json(
          { error: 'Name and phone are required' },
          { status: 400 }
        );
      }

      log.info('Creating patient', { phone });
      const result = await fetchMutation(api.patients.create, {
        userEmail: "",
        name,
        phone,
        notes,
        birthday,
      }, { token });

      log.info('Patient created', { patientId: result.patientId });
      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      log.error('Failed to create patient', error);
      return NextResponse.json(
        { error: safeErrorMessage(error, 'Failed to create patient') },
        { status: 500 }
      );
    }
  });
}

/**
 * PATCH /api/patients - Update a patient
 */
export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'PATCH',
    route: 'patients.update',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await request.json();
      const { patientId, name, phone, notes, birthday } = body;

      if (!patientId) {
        log.warn('Missing patient ID');
        return NextResponse.json(
          { error: 'Patient ID is required' },
          { status: 400 }
        );
      }

      log.info('Updating patient', { patientId });
      await fetchMutation(api.patients.update, {
        userEmail: "",
        patientId: patientId as Id<"patients">,
        name,
        phone,
        notes,
        birthday,
      }, { token });

      log.info('Patient updated', { patientId });
      return NextResponse.json({ success: true });
    } catch (error) {
      log.error('Failed to update patient', error);
      return NextResponse.json(
        { error: safeErrorMessage(error, 'Failed to update patient') },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/patients - Delete a patient
 */
export async function DELETE(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'DELETE',
    route: 'patients.delete',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();

    try {
      const token = await convexAuthNextjsToken();
      if (!token) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get('id');

      if (!patientId) {
        log.warn('Missing patient ID');
        return NextResponse.json(
          { error: 'Patient ID is required' },
          { status: 400 }
        );
      }

      log.info('Deleting patient', { patientId });
      await fetchMutation(api.patients.remove, {
        userEmail: "",
        patientId: patientId as Id<"patients">,
      }, { token });

      log.info('Patient deleted', { patientId });
      return NextResponse.json({ success: true });
    } catch (error) {
      log.error('Failed to delete patient', error);
      return NextResponse.json(
        { error: safeErrorMessage(error, 'Failed to delete patient') },
        { status: 500 }
      );
    }
  });
}
