/**
 * Message Templates API
 * 
 * GET /api/messages/templates - Get active templates
 * POST /api/messages/templates - Create a template
 * PATCH /api/messages/templates - Update a template
 * DELETE /api/messages/templates - Delete a template
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../../logto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { runWithContext, createRequestContext, getLogger, extendContext } from '@/lib/observability';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'messages.templates.list',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      const userEmail = claims.email;
      extendContext({ userEmail });
      
      const { searchParams } = new URL(request.url);
      const includeInactive = searchParams.get('all') === '1';
      
      log.info('Fetching templates', { includeInactive });
      
      const templates = includeInactive
        ? await convex.query(api.messageTemplates.getAllTemplates, { userEmail })
        : await convex.query(api.messageTemplates.getActiveTemplates, { userEmail });
      
      log.info('Fetched templates', { count: templates.length });
      return NextResponse.json(templates);
    } catch (error) {
      log.error('Error fetching templates', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'POST',
    route: 'messages.templates.create',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      const userEmail = claims.email;
      extendContext({ userEmail });
      
      const body = await request.json();
      const { name, body: templateBody, category } = body;
      
      if (!name || !templateBody) {
        return NextResponse.json({ error: 'name and body are required' }, { status: 400 });
      }
      
      log.info('Creating template', { name });
      
      const templateId = await convex.mutation(api.messageTemplates.create, {
        userEmail,
        name,
        body: templateBody,
        category,
      });
      
      log.info('Created template', { templateId });
      return NextResponse.json({ templateId });
    } catch (error) {
      log.error('Error creating template', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'PATCH',
    route: 'messages.templates.update',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      const userEmail = claims.email;
      extendContext({ userEmail });
      
      const body = await request.json();
      const { templateId, name, body: templateBody, category, isActive, sortOrder } = body;
      
      if (!templateId) {
        return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
      }
      
      log.info('Updating template', { templateId });
      
      await convex.mutation(api.messageTemplates.update, {
        userEmail,
        templateId: templateId as Id<'messageTemplates'>,
        name,
        body: templateBody,
        category,
        isActive,
        sortOrder,
      });
      
      log.info('Updated template');
      return NextResponse.json({ ok: true });
    } catch (error) {
      log.error('Error updating template', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'DELETE',
    route: 'messages.templates.delete',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    try {
      const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
      
      if (!isAuthenticated || !claims?.email) {
        log.warn('Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      
      const userEmail = claims.email;
      extendContext({ userEmail });
      
      const { searchParams } = new URL(request.url);
      const templateId = searchParams.get('templateId');
      
      if (!templateId) {
        return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
      }
      
      log.info('Deleting template', { templateId });
      
      await convex.mutation(api.messageTemplates.remove, {
        userEmail,
        templateId: templateId as Id<'messageTemplates'>,
      });
      
      log.info('Deleted template');
      return NextResponse.json({ ok: true });
    } catch (error) {
      log.error('Error deleting template', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

