/**
 * Convex Logger
 *
 * Lightweight, synchronous logger for Convex functions.
 *
 * Convex runs in a serverless environment where:
 * - Each function invocation is isolated
 * - No persistent state between invocations
 * - No process signals or shutdown hooks
 * - Console output is captured by Convex dashboard
 *
 * This logger writes structured JSON to console immediately (no buffering)
 * so logs are never lost and appear in the Convex dashboard.
 *
 * Each logger instance generates a unique request ID for correlating
 * all log entries within a single function invocation.
 *
 * @example
 * ```typescript
 * import { createConvexLogger } from './lib/logger';
 *
 * export const myMutation = mutation({
 *   handler: async (ctx, args) => {
 *     const log = createConvexLogger({
 *       functionName: 'myMutation',
 *       teamId: args.teamId,
 *     });
 *
 *     log.info('Processing mutation');
 *     // ...
 *     log.info('Mutation complete', { recordsAffected: 5 });
 *   },
 * });
 * ```
 */

/**
 * Generate a unique request ID for correlating logs within a function invocation.
 * Format: cvx-{timestamp}-{random}
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `cvx-${timestamp}-${random}`;
}

/**
 * Log levels for Convex logger.
 */
export type ConvexLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Numeric values for log level comparison.
 */
const LOG_LEVEL_VALUES: Record<ConvexLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Context passed to the Convex logger.
 * All fields become tags in log output.
 */
export interface ConvexLogContext {
  /** Name of the Convex function (e.g., 'reminders.sendReminder') */
  functionName: string;
  /** Unique request ID for correlating logs (auto-generated if not provided) */
  requestId?: string;
  /** Team ID for multi-tenant context */
  teamId?: string;
  /** User email if available */
  userEmail?: string;
  /** Appointment ID if relevant */
  appointmentId?: string;
  /** Patient ID if relevant */
  patientId?: string;
  /** Any additional context */
  [key: string]: string | number | boolean | undefined;
}

/**
 * Options for creating a Convex logger.
 */
export interface ConvexLoggerOptions {
  /** Minimum level to output. Defaults to 'debug'. */
  minLevel?: ConvexLogLevel;
}

/**
 * Convex logger interface.
 */
export interface ConvexLogger {
  debug: (message: string, extra?: Record<string, unknown>) => void;
  info: (message: string, extra?: Record<string, unknown>) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  error: (message: string, error?: unknown, extra?: Record<string, unknown>) => void;
  /** Create a child logger with additional context */
  child: (additionalContext: Partial<ConvexLogContext>) => ConvexLogger;
}

/**
 * Create a structured logger for Convex functions.
 *
 * Outputs JSON to console which is captured by Convex dashboard.
 * All logs are synchronous and immediate - no buffering, no data loss.
 *
 * A unique request ID is auto-generated for each logger instance to
 * correlate all log entries within a single function invocation.
 *
 * @param context - Base context for all log entries
 * @param options - Logger options
 * @returns A ConvexLogger instance
 */
export function createConvexLogger(
  context: ConvexLogContext,
  options: ConvexLoggerOptions = {}
): ConvexLogger {
  const { minLevel = 'debug' } = options;
  const minLevelValue = LOG_LEVEL_VALUES[minLevel];
  
  // Auto-generate requestId if not provided
  const requestId = context.requestId || generateRequestId();
  const contextWithRequestId = { ...context, requestId };

  /**
   * Write a log entry to console as JSON.
   */
  function writeLog(
    level: ConvexLogLevel,
    message: string,
    extra?: Record<string, unknown>,
    error?: unknown
  ): void {
    // Skip if below minimum level
    if (LOG_LEVEL_VALUES[level] < minLevelValue) {
      return;
    }

    // Build the log record
    const record: Record<string, unknown> = {
      dt: new Date().toISOString(),
      level,
      message,
      service: 'smovr-dash',
      runtime: 'convex',
      ...contextWithRequestId,
      ...extra,
    };

    // Add error details if present
    if (error) {
      if (error instanceof Error) {
        record.error_name = error.name;
        record.error_message = error.message;
        record.error_stack = error.stack;
      } else {
        record.error_data = error;
      }
    }

    // Write to console - Convex captures this
    const json = JSON.stringify(record);

    switch (level) {
      case 'error':
        console.error(json);
        break;
      case 'warn':
        console.warn(json);
        break;
      default:
        console.log(json);
    }
  }

  return {
    debug: (message: string, extra?: Record<string, unknown>) => {
      writeLog('debug', message, extra);
    },

    info: (message: string, extra?: Record<string, unknown>) => {
      writeLog('info', message, extra);
    },

    warn: (message: string, extra?: Record<string, unknown>) => {
      writeLog('warn', message, extra);
    },

    error: (message: string, error?: unknown, extra?: Record<string, unknown>) => {
      writeLog('error', message, extra, error);
    },

    child: (additionalContext: Partial<ConvexLogContext>): ConvexLogger => {
      // Pass the same requestId to maintain correlation
      return createConvexLogger(
        { ...contextWithRequestId, ...additionalContext },
        options
      );
    },
  };
}

/**
 * Create a logger for a Convex query function.
 * Convenience wrapper that sets runtime context.
 */
export function createQueryLogger(
  functionName: string,
  context?: Partial<ConvexLogContext>
): ConvexLogger {
  return createConvexLogger({
    functionName,
    functionType: 'query',
    ...context,
  });
}

/**
 * Create a logger for a Convex mutation function.
 * Convenience wrapper that sets runtime context.
 */
export function createMutationLogger(
  functionName: string,
  context?: Partial<ConvexLogContext>
): ConvexLogger {
  return createConvexLogger({
    functionName,
    functionType: 'mutation',
    ...context,
  });
}

/**
 * Create a logger for a Convex action function.
 * Convenience wrapper that sets runtime context.
 */
export function createActionLogger(
  functionName: string,
  context?: Partial<ConvexLogContext>
): ConvexLogger {
  return createConvexLogger({
    functionName,
    functionType: 'action',
    ...context,
  });
}

