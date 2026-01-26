/**
 * Unified Logger
 *
 * The main logging interface for the application.
 * Loggers are bound to a context and dispatch entries through a SinkRegistry.
 */

import { LogLevel, LogTags, LogEntry, LogContext } from './types';
import { SinkRegistry } from './sinks';

/**
 * Logger - the unified logging interface.
 *
 * Each Logger instance is bound to:
 * - A SinkRegistry (where logs are dispatched)
 * - A LogContext (request-scoped metadata attached to all entries)
 *
 * Loggers are immutable - child() creates a new logger with extended context.
 */
export class Logger {
  private readonly context: LogContext;
  private readonly sinkRegistry: SinkRegistry;

  constructor(sinkRegistry: SinkRegistry, context: LogContext = { requestId: 'global' }) {
    this.sinkRegistry = sinkRegistry;
    this.context = context;
  }

  /**
   * Create a child logger with additional context.
   * The new logger inherits all parent context plus the new tags.
   * This is immutable - the parent logger is unchanged.
   */
  child(additionalContext: Partial<LogContext>): Logger {
    return new Logger(this.sinkRegistry, {
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Log a DEBUG message.
   * Use for detailed diagnostic information during development.
   */
  debug(message: string, tags?: LogTags, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, tags, data);
  }

  /**
   * Log an INFO message.
   * Use for general informational messages about application flow.
   */
  info(message: string, tags?: LogTags, data?: unknown): void {
    this.log(LogLevel.INFO, message, tags, data);
  }

  /**
   * Log a WARN message.
   * Use for potentially harmful situations that don't prevent operation.
   */
  warn(message: string, tags?: LogTags, data?: unknown): void {
    this.log(LogLevel.WARN, message, tags, data);
  }

  /**
   * Log an ERROR message.
   * Use for error events that might still allow the application to continue.
   *
   * @param message - Description of what failed
   * @param error - Optional Error object or other error data
   * @param tags - Optional additional tags
   */
  error(message: string, error?: Error | unknown, tags?: LogTags): void {
    const err = error instanceof Error ? error : undefined;
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date(),
      tags: { ...this.context, ...tags },
      error: err,
      // If error is not an Error instance, include it as data
      data: err ? undefined : error,
    };
    this.sinkRegistry.dispatch(entry);
  }

  /**
   * Log a FATAL message.
   * Use for severe errors that will likely cause the application to abort.
   *
   * @param message - Description of the fatal error
   * @param error - Optional Error object
   * @param tags - Optional additional tags
   */
  fatal(message: string, error?: Error | unknown, tags?: LogTags): void {
    const err = error instanceof Error ? error : undefined;
    const entry: LogEntry = {
      level: LogLevel.FATAL,
      message,
      timestamp: new Date(),
      tags: { ...this.context, ...tags },
      error: err,
      data: err ? undefined : error,
    };
    this.sinkRegistry.dispatch(entry);
  }

  /**
   * Internal logging method used by debug/info/warn.
   */
  private log(level: LogLevel, message: string, tags?: LogTags, data?: unknown): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      tags: { ...this.context, ...tags },
      data,
    };
    this.sinkRegistry.dispatch(entry);
  }

  /**
   * Get a copy of the current context.
   * Useful for passing context to child processes or external services.
   */
  getContext(): LogContext {
    return { ...this.context };
  }

  /**
   * Get the sink registry.
   * Useful for advanced operations like flushing.
   */
  getSinkRegistry(): SinkRegistry {
    return this.sinkRegistry;
  }

  /**
   * Flush all pending log writes.
   * Call this before process exit or at end of request.
   */
  async flush(): Promise<void> {
    await this.sinkRegistry.flush();
  }
}

