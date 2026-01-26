/**
 * API Route Wrapper
 *
 * Higher-order function that wraps Next.js API route handlers with observability:
 * - Automatic request context (requestId, pathname, method)
 * - Auth enrichment (userEmail from Logto)
 * - Request/response logging
 * - Error handling with logging
 * - Flush at end of request
 *
 * @example
 * ```typescript
 * import { withObservability } from '@/lib/observability/api-wrapper';
 *
 * async function handler(request: NextRequest) {
 *   const log = getLogger();
 *   log.info('Processing request');
 *   return NextResponse.json({ ok: true });
 * }
 *
 * export const GET = withObservability(handler, { name: 'appointments.list' });
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '@/app/logto';
import {
  runWithContext,
  generateRequestId,
  getLogger,
  extendContext,
  withContext,
} from './context';
import { globalSinkRegistry } from './index';
import { LogContext } from './types';

// Re-export withContext for convenience
export { withContext };

/**
 * Type for Next.js API route handler.
 */
type ApiHandler = (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

/**
 * Options for withObservability wrapper.
 */
export interface WithObservabilityOptions {
  /** Route name for logging (e.g., 'appointments.list', 'users.create') */
  name: string;
  /** Whether to log request start. Defaults to true. */
  logStart?: boolean;
  /** Whether to log request completion. Defaults to true. */
  logEnd?: boolean;
  /** Whether to attempt auth enrichment. Defaults to true. */
  enrichAuth?: boolean;
}

/**
 * Wrap an API route handler with observability.
 *
 * Features:
 * - Creates request context with unique requestId
 * - Logs request start and completion with timing
 * - Enriches context with auth info (userEmail) if available
 * - Catches and logs errors
 * - Flushes logs at end of request
 *
 * @param handler - The API route handler function
 * @param options - Configuration options
 * @returns Wrapped handler with observability
 */
export function withObservability(
  handler: ApiHandler,
  options: WithObservabilityOptions
): ApiHandler {
  const {
    name,
    logStart = true,
    logEnd = true,
    enrichAuth = true,
  } = options;

  return async (
    request: NextRequest,
    routeContext?: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    // Get or generate request ID (may come from middleware)
    const requestId =
      request.headers.get('x-request-id') ?? generateRequestId();
    const startTime = performance.now();

    // Build initial context
    const logContext: LogContext = {
      requestId,
      pathname: request.nextUrl.pathname,
      method: request.method,
      route: name,
    };

    return runWithContext(logContext, async () => {
      const log = getLogger();

      try {
        // Enrich context with auth info if requested
        if (enrichAuth) {
          try {
            const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
            if (isAuthenticated && claims?.email) {
              extendContext({ userEmail: claims.email });
            }
          } catch (authError) {
            // Auth enrichment is best-effort, don't fail the request
            log.debug('Auth enrichment skipped', { 
              reason: authError instanceof Error ? authError.message : 'unknown error' 
            });
          }
        }

        if (logStart) {
          log.info('Request started', {
            url: request.nextUrl.pathname,
          });
        }

        // Call the actual handler
        const response = await handler(request, routeContext);

        if (logEnd) {
          const duration = performance.now() - startTime;
          log.info('Request completed', {
            status: response.status,
            durationMs: Math.round(duration),
          });
        }

        // Flush logs before returning
        await globalSinkRegistry.flush();

        // Add request ID to response headers for correlation
        response.headers.set('x-request-id', requestId);

        return response;
      } catch (error) {
        const duration = performance.now() - startTime;

        // Log the error
        log.error('Request failed', error, {
          durationMs: Math.round(duration),
        });

        // Flush logs before returning error response
        await globalSinkRegistry.flush();

        // Return error response
        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : 'Internal server error',
            requestId, // Include for debugging
          },
          { status: 500 }
        );
      }
    });
  };
}

