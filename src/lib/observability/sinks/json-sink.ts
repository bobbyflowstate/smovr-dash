/**
 * JSON Sink
 *
 * Outputs structured JSON logs - one JSON object per line (NDJSON format).
 * Ideal for production environments where logs are ingested by log aggregators.
 *
 * All writes are synchronous and immediate - no buffering, no data loss.
 * Platform log collectors (Vercel, Convex, etc.) capture stdout/stderr reliably.
 */

import { LogSink } from '../sinks';
import { LogEntry, LogLevel, LogLevelNames, serializeError } from '../types';

export interface JsonSinkOptions {
  /** Minimum log level to output. Defaults to DEBUG (all logs). */
  minLevel?: LogLevel;
  /**
   * Custom writer function. Defaults to console.log.
   * Use this to write to a file or other destination.
   */
  writer?: (line: string) => void;
  /**
   * Whether to pretty-print JSON. Defaults to false.
   * Set to true for local development readability.
   */
  pretty?: boolean;
  /**
   * Additional static fields to include in every log entry.
   * Useful for adding service name, version, environment, etc.
   */
  staticFields?: Record<string, unknown>;
}

export class JsonSink implements LogSink {
  readonly name = 'json';
  readonly minLevel: LogLevel;

  private readonly writer: (line: string) => void;
  private readonly pretty: boolean;
  private readonly staticFields: Record<string, unknown>;

  constructor(options: JsonSinkOptions = {}) {
    this.minLevel = options.minLevel ?? LogLevel.DEBUG;
    this.writer = options.writer ?? ((line) => console.log(line));
    this.pretty = options.pretty ?? false;
    this.staticFields = options.staticFields ?? {};
  }

  /**
   * Write a log entry as a JSON line.
   * This is synchronous and immediate - no buffering.
   */
  write(entry: LogEntry): void {
    const record: Record<string, unknown> = {
      // Standard fields first
      timestamp: entry.timestamp.toISOString(),
      level: LogLevelNames[entry.level].toLowerCase(),
      message: entry.message,

      // Static fields (service name, version, etc.)
      ...this.staticFields,

      // Dynamic tags from context
      ...entry.tags,
    };

    // Add error details if present
    if (entry.error) {
      record.error = serializeError(entry.error);
    }

    // Add data payload if present
    if (entry.data !== undefined) {
      record.data = entry.data;
    }

    // Serialize to JSON
    const json = this.pretty
      ? JSON.stringify(record, null, 2)
      : JSON.stringify(record);

    this.writer(json);
  }
}

