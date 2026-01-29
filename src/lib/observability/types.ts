/**
 * Observability Types
 *
 * Core type definitions for the unified logging system.
 */

/**
 * Log levels with numeric priority for filtering.
 * Higher numbers = more severe.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

/**
 * Human-readable level names for output formatting.
 */
export const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
};

/**
 * Tags are flexible key-value pairs for context.
 * Used for both LogContext and call-site tags.
 */
export type LogTags = Record<string, string | number | boolean | null | undefined>;

/**
 * Structured log entry - the core unit passed to sinks.
 */
export interface LogEntry {
  /** Severity level */
  level: LogLevel;
  /** Human-readable message */
  message: string;
  /** When the log was created */
  timestamp: Date;
  /** Merged context + call-site tags */
  tags: LogTags;
  /** Optional error object for ERROR/FATAL levels */
  error?: Error;
  /** Optional structured data payload */
  data?: unknown;
}

/**
 * Log context carried through request lifecycle.
 * Automatically attached to all log entries within a request scope.
 */
export interface LogContext {
  /** Unique per-request UUID for correlation */
  requestId: string;
  /** Authenticated user email (if available) */
  userEmail?: string;
  /** Multi-tenant team ID (if available) */
  teamId?: string;
  /** Request pathname */
  pathname?: string;
  /** HTTP method */
  method?: string;
  /** Route name/identifier */
  route?: string;
  /** Allow additional string-indexed properties */
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Serialized error for JSON output.
 */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Serialize an Error object for JSON-safe output.
 */
export function serializeError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

