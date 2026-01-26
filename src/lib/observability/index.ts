/**
 * Observability System
 *
 * Unified logging with sinks (producer/consumer pattern) and request context.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { getLogger, runWithContext, createRequestContext } from '@/lib/observability';
 *
 * // In an API route:
 * export async function GET(request: NextRequest) {
 *   const context = createRequestContext({
 *     pathname: request.nextUrl.pathname,
 *     method: 'GET',
 *   });
 *
 *   return runWithContext(context, async () => {
 *     const log = getLogger();
 *     log.info('Handling request');
 *     // ... your code
 *   });
 * }
 * ```
 *
 * ## Architecture
 *
 * ```
 * Application Code
 *       │
 *       ▼
 *   getLogger()  ──► Logger (bound to current context)
 *       │
 *       ▼
 *  SinkRegistry  ──► Dispatches to registered sinks
 *       │
 *       ├──► ConsoleSink (dev, colored)
 *       ├──► JsonSink (prod, structured)
 *       └──► ExternalSink (buffered + fallback)
 * ```
 */

import { SinkRegistry } from './sinks';
import { ConsoleSink } from './sinks/console-sink';
import { ExternalSink } from './sinks/external-sink';
import { Logger } from './logger';
import { LogLevel, LogEntry, LogLevelNames, serializeError } from './types';
import { initializeContext } from './context';

// ============================================================================
// Global Sink Registry
// ============================================================================

/**
 * Global sink registry - the single point of log dispatch.
 * All loggers use this registry to send logs to registered sinks.
 */
export const globalSinkRegistry = new SinkRegistry();

// ============================================================================
// Environment-Based Sink Configuration
// ============================================================================

/**
 * Configure default sinks.
 *
 * Console sink is used for ALL environments so logs are visible in:
 * - Local development terminal
 * - Vercel function logs
 * - Convex dashboard logs
 *
 * BetterStack can be added via `configureBetterStack()` when ready.
 */
function configureDefaultSinks(): void {
  // Use colors only in development (terminals support ANSI, but log aggregators don't)
  const useColors = process.env.NODE_ENV !== 'production';

  globalSinkRegistry.register(
    new ConsoleSink({
      minLevel: LogLevel.DEBUG,
      colors: useColors,
      timestamps: true,
      stackTraces: true,
    })
  );
}

// Configure sinks on module load
configureDefaultSinks();

// Initialize context system with global registry
initializeContext(globalSinkRegistry);

// ============================================================================
// BetterStack Integration
// ============================================================================

/**
 * BetterStack configuration options.
 */
export interface BetterStackConfig {
  /** Your BetterStack source token */
  sourceToken: string;
  /** 
   * Custom endpoint URL for your BetterStack source.
   * Required for EU region sources (e.g., https://s1234567.eu-nbg-2.betterstackdata.com).
   * Defaults to https://in.logs.betterstack.com (US region).
   */
  endpoint?: string;
  /** Minimum log level to send to BetterStack. Defaults to DEBUG (all logs). */
  minLevel?: LogLevel;
  /** Whether to also log to console as fallback. Defaults to true. */
  consoleFallback?: boolean;
  /** Batch size before sending. Defaults to 10 for faster delivery. */
  batchSize?: number;
  /** Flush interval in ms. Defaults to 5000. */
  flushIntervalMs?: number;
}

/**
 * Transform LogEntry to BetterStack's expected format.
 * BetterStack expects a flat JSON object with certain conventions.
 */
function betterStackTransform(entry: LogEntry): Record<string, unknown> {
  const record: Record<string, unknown> = {
    // BetterStack standard fields
    dt: entry.timestamp.toISOString(), // datetime field
    level: LogLevelNames[entry.level].toLowerCase(),
    message: entry.message,

    // Service identification
    service: 'smovr-dash',
    env: process.env.NODE_ENV ?? 'development',

    // Context tags (spread all)
    ...entry.tags,
  };

  // Add error details if present
  if (entry.error) {
    const serialized = serializeError(entry.error);
    record.error_name = serialized.name;
    record.error_message = serialized.message;
    record.error_stack = serialized.stack;
  }

  // Add data payload if present
  if (entry.data !== undefined) {
    record.data = entry.data;
  }

  return record;
}

/**
 * Configure BetterStack as an additional log sink.
 *
 * Call this during app initialization if you want logs sent to BetterStack.
 * Console sink remains active as the primary/fallback sink.
 *
 * @example
 * ```typescript
 * import { configureBetterStack } from '@/lib/observability';
 *
 * if (process.env.BETTERSTACK_SOURCE_TOKEN) {
 *   configureBetterStack({
 *     sourceToken: process.env.BETTERSTACK_SOURCE_TOKEN,
 *   });
 * }
 * ```
 */
export function configureBetterStack(config: BetterStackConfig): void {
  const {
    sourceToken,
    endpoint = 'https://in.logs.betterstack.com',
    minLevel = LogLevel.DEBUG,
    consoleFallback = true,
    batchSize = 10,
    flushIntervalMs = 5000,
  } = config;

  globalSinkRegistry.register(
    new ExternalSink({
      name: 'betterstack',
      endpoint,
      apiKey: sourceToken,
      authHeader: 'Authorization', // Uses "Bearer <token>" format
      minLevel,
      consoleFallback, // Already have ConsoleSink, but extra safety
      batchSize,
      flushIntervalMs,
      transform: betterStackTransform,
      staticFields: {
        service: 'smovr-dash',
      },
    })
  );

  globalLogger.info('BetterStack sink configured', { endpoint, minLevel: LogLevelNames[minLevel] });
}

// ============================================================================
// Global Logger (for non-request-scoped logging)
// ============================================================================

/**
 * Global logger for code that runs outside of request context.
 * Use getLogger() instead when inside a request for automatic context.
 *
 * Examples of when to use globalLogger:
 * - Application startup/shutdown
 * - Background jobs (if not within a context)
 * - Module initialization
 */
export const globalLogger = new Logger(globalSinkRegistry, { requestId: 'global' });

// ============================================================================
// Re-exports
// ============================================================================

// Types
export {
  LogLevel,
  LogLevelNames,
  type LogEntry,
  type LogContext,
  type LogTags,
  type SerializedError,
  serializeError,
} from './types';

// Core classes
export { Logger } from './logger';
export { SinkRegistry, type LogSink } from './sinks';

// Sink implementations
export { ConsoleSink, type ConsoleSinkOptions } from './sinks/console-sink';
export { JsonSink, type JsonSinkOptions } from './sinks/json-sink';
export { ExternalSink, type ExternalSinkOptions } from './sinks/external-sink';

// Context utilities
export {
  initializeContext,
  runWithContext,
  getCurrentContext,
  hasContext,
  extendContext,
  getLogger,
  createChildLogger,
  generateRequestId,
  createRequestContext,
  getContextForSerialization,
  withContext,
} from './context';

// API route wrapper
export {
  withObservability,
  type WithObservabilityOptions,
} from './api-wrapper';

// ============================================================================
// Auto-Configuration from Environment Variables
// ============================================================================

/**
 * Auto-configure BetterStack if BETTERSTACK_SOURCE_TOKEN is set.
 *
 * This runs at module load time, so logs are captured immediately.
 * 
 * Environment variables:
 * - BETTERSTACK_SOURCE_TOKEN: Required. Your BetterStack source token.
 * - BETTERSTACK_ENDPOINT: Optional. Custom endpoint URL for EU/other regions.
 *   Example: https://s1234567.eu-nbg-2.betterstackdata.com
 * - BETTERSTACK_MIN_LEVEL: Optional. Minimum log level (DEBUG, INFO, WARN, ERROR, FATAL).
 * - BETTERSTACK_BATCH_SIZE: Optional. Logs to batch before sending (default: 10).
 * - BETTERSTACK_FLUSH_INTERVAL_MS: Optional. Flush interval in ms (default: 5000).
 */
function autoConfigureBetterStack(): void {
  const sourceToken = process.env.BETTERSTACK_SOURCE_TOKEN;
  if (!sourceToken) {
    return;
  }

  // Custom endpoint URL (required for EU region, optional for US)
  const endpoint = process.env.BETTERSTACK_ENDPOINT || 'https://in.logs.betterstack.com';

  // Parse min level from env var (default to INFO for external sinks to reduce noise)
  const minLevelStr = process.env.BETTERSTACK_MIN_LEVEL?.toUpperCase() || 'INFO';
  const minLevel: LogLevel = {
    DEBUG: LogLevel.DEBUG,
    INFO: LogLevel.INFO,
    WARN: LogLevel.WARN,
    ERROR: LogLevel.ERROR,
    FATAL: LogLevel.FATAL,
  }[minLevelStr] ?? LogLevel.INFO;

  // Parse optional batch settings
  const batchSize = parseInt(process.env.BETTERSTACK_BATCH_SIZE || '10', 10);
  const flushIntervalMs = parseInt(process.env.BETTERSTACK_FLUSH_INTERVAL_MS || '5000', 10);

  globalSinkRegistry.register(
    new ExternalSink({
      name: 'betterstack',
      endpoint,
      apiKey: sourceToken,
      authHeader: 'Authorization',
      minLevel,
      consoleFallback: true,
      batchSize: isNaN(batchSize) ? 10 : batchSize,
      flushIntervalMs: isNaN(flushIntervalMs) ? 5000 : flushIntervalMs,
      transform: betterStackTransform,
      staticFields: {
        service: 'smovr-dash',
      },
    })
  );

  globalLogger.info('BetterStack sink auto-configured from env', {
    endpoint,
    minLevel: LogLevelNames[minLevel],
    batchSize,
    flushIntervalMs,
  });
}

// Run auto-configuration
autoConfigureBetterStack();

