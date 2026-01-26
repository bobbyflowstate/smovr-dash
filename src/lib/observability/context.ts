/**
 * Context Propagation
 *
 * Uses AsyncLocalStorage to propagate LogContext through async execution chains.
 * This allows any code within a request to access the current logging context
 * without explicit parameter passing.
 *
 * Usage:
 *   // At request entry point (middleware or API route)
 *   runWithContext({ requestId: 'abc', userEmail: 'user@example.com' }, async () => {
 *     // Anywhere inside here:
 *     const log = getLogger();
 *     log.info('Hello'); // Automatically includes requestId, userEmail
 *   });
 */

import { AsyncLocalStorage } from 'async_hooks';
import { LogContext } from './types';
import { Logger } from './logger';
import { SinkRegistry } from './sinks';

/**
 * AsyncLocalStorage instance for request-scoped context.
 * Each async execution chain has its own isolated context.
 */
const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

/**
 * Reference to the global sink registry.
 * Set by `initializeContext()` during app startup.
 */
let globalRegistry: SinkRegistry | null = null;

/**
 * Initialize the context system with the global sink registry.
 * Call this once during app startup.
 *
 * @param registry - The global SinkRegistry to use for loggers
 */
export function initializeContext(registry: SinkRegistry): void {
  globalRegistry = registry;
}

/**
 * Generate a unique request ID.
 * Uses crypto.randomUUID() for proper uniqueness.
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Run a function with a specific LogContext.
 * The context is available to all code within the async execution chain.
 *
 * @param context - The LogContext to set for this execution
 * @param fn - The function to run with the context
 * @returns The return value of fn
 *
 * @example
 * ```typescript
 * const result = await runWithContext(
 *   { requestId: 'abc', userEmail: 'user@example.com' },
 *   async () => {
 *     const log = getLogger();
 *     log.info('Processing request');
 *     return await doWork();
 *   }
 * );
 * ```
 */
export function runWithContext<T>(context: LogContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current LogContext.
 * Returns a default context if called outside of runWithContext().
 *
 * @returns The current LogContext, or a default if none is set
 */
export function getCurrentContext(): LogContext {
  return asyncLocalStorage.getStore() ?? { requestId: 'no-context' };
}

/**
 * Check if we're currently inside a context.
 *
 * @returns true if inside runWithContext(), false otherwise
 */
export function hasContext(): boolean {
  return asyncLocalStorage.getStore() !== undefined;
}

/**
 * Extend the current context with additional tags.
 * Mutates the current context in place.
 *
 * Use this to add information discovered during request processing,
 * like teamId after authentication.
 *
 * @param tags - Additional context tags to merge
 *
 * @example
 * ```typescript
 * runWithContext({ requestId: 'abc' }, async () => {
 *   // After authentication
 *   extendContext({ userEmail: user.email, teamId: user.teamId });
 *
 *   // All subsequent logs include userEmail and teamId
 *   const log = getLogger();
 *   log.info('Authenticated');
 * });
 * ```
 */
export function extendContext(tags: Partial<LogContext>): void {
  const current = asyncLocalStorage.getStore();
  if (current) {
    Object.assign(current, tags);
  }
}

/**
 * Get a Logger bound to the current context.
 * This is the primary way to obtain a logger in request-scoped code.
 *
 * @returns A Logger instance with the current context
 * @throws Error if initializeContext() hasn't been called
 *
 * @example
 * ```typescript
 * runWithContext({ requestId: 'abc' }, async () => {
 *   const log = getLogger();
 *   log.info('Hello'); // Includes requestId: 'abc'
 * });
 * ```
 */
export function getLogger(): Logger {
  if (!globalRegistry) {
    throw new Error(
      'Logger not initialized. Call initializeContext(registry) during app startup.'
    );
  }

  const context = getCurrentContext();
  return new Logger(globalRegistry, context);
}

/**
 * Create a child logger with additional context.
 * The child logger inherits the current context plus the additional tags.
 *
 * Useful when you want to add context for a specific operation without
 * affecting the global context.
 *
 * @param additionalContext - Extra context for the child logger
 * @returns A new Logger with merged context
 *
 * @example
 * ```typescript
 * const log = getLogger();
 * const childLog = createChildLogger({ operation: 'sendReminder', appointmentId: '123' });
 * childLog.info('Sending reminder'); // Includes requestId + operation + appointmentId
 * ```
 */
export function createChildLogger(additionalContext: Partial<LogContext>): Logger {
  const log = getLogger();
  return log.child(additionalContext);
}

/**
 * Get the current context as a plain object for serialization.
 * Useful for passing context to external services or child processes.
 *
 * @returns A copy of the current context
 */
export function getContextForSerialization(): LogContext {
  return { ...getCurrentContext() };
}

/**
 * Create a context object for a new request.
 * Helper function to create a standard request context.
 *
 * Automatically includes OFFICE_ID from environment for tenant separation.
 *
 * @param options - Request information
 * @returns A LogContext for the request
 */
export function createRequestContext(options: {
  pathname?: string;
  method?: string;
  route?: string;
  userEmail?: string;
  teamId?: string;
}): LogContext {
  return {
    requestId: generateRequestId(),
    // Include OFFICE_ID for tenant separation
    ...(process.env.OFFICE_ID && { officeId: process.env.OFFICE_ID }),
    ...options,
  };
}

/**
 * Create a simple context wrapper for async operations.
 * Useful for server actions or other server-side code that needs logging context.
 *
 * @param name - Name of the operation (e.g., 'serverAction.myAction')
 * @param fn - Async function to run with context
 * @returns The result of fn
 *
 * @example
 * ```typescript
 * import { withContext, getLogger } from '@/lib/observability';
 *
 * export async function myServerAction() {
 *   return withContext('serverAction.myAction', async () => {
 *     const log = getLogger();
 *     log.info('Executing server action');
 *     // ...
 *   });
 * }
 * ```
 */
export async function withContext<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!globalRegistry) {
    throw new Error(
      'Logger not initialized. Call initializeContext(registry) during app startup.'
    );
  }

  const requestId = generateRequestId();
  const startTime = performance.now();

  const logContext: LogContext = {
    requestId,
    route: name,
    // Include OFFICE_ID for tenant separation
    ...(process.env.OFFICE_ID && { officeId: process.env.OFFICE_ID }),
  };

  return runWithContext(logContext, async () => {
    const log = getLogger();

    try {
      log.debug('Context started', { route: name });
      const result = await fn();

      const duration = performance.now() - startTime;
      log.debug('Context completed', { durationMs: Math.round(duration) });

      await globalRegistry!.flush();
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      log.error('Context failed', error, { durationMs: Math.round(duration) });

      await globalRegistry!.flush();
      throw error;
    }
  });
}

