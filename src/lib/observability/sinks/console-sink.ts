/**
 * Console Sink
 *
 * Synchronous console output with optional color formatting.
 * Ideal for development and as a fallback in serverless environments.
 *
 * All writes are synchronous and immediate - no buffering, no data loss.
 */

import { LogSink } from '../sinks';
import { LogEntry, LogLevel, LogLevelNames, serializeError } from '../types';

/**
 * ANSI color codes for terminal output.
 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[90m', // Gray
  [LogLevel.INFO]: '\x1b[36m',  // Cyan
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
  [LogLevel.FATAL]: '\x1b[35m', // Magenta
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

export interface ConsoleSinkOptions {
  /** Minimum log level to output. Defaults to DEBUG (all logs). */
  minLevel?: LogLevel;
  /** Whether to use ANSI colors. Defaults to true in non-production. */
  colors?: boolean;
  /** Whether to include timestamp. Defaults to true. */
  timestamps?: boolean;
  /** Whether to include full stack traces. Defaults to true. */
  stackTraces?: boolean;
}

export class ConsoleSink implements LogSink {
  readonly name = 'console';
  readonly minLevel: LogLevel;

  private readonly useColors: boolean;
  private readonly showTimestamps: boolean;
  private readonly showStackTraces: boolean;

  constructor(options: ConsoleSinkOptions = {}) {
    this.minLevel = options.minLevel ?? LogLevel.DEBUG;
    this.useColors = options.colors ?? (process.env.NODE_ENV !== 'production');
    this.showTimestamps = options.timestamps ?? true;
    this.showStackTraces = options.stackTraces ?? true;
  }

  /**
   * Write a log entry to the console.
   * This is synchronous and immediate - no buffering.
   */
  write(entry: LogEntry): void {
    const levelName = LogLevelNames[entry.level];
    const color = this.useColors ? LEVEL_COLORS[entry.level] : '';
    const dim = this.useColors ? DIM : '';
    const reset = this.useColors ? RESET : '';

    // Build the log line
    const parts: string[] = [];

    // Timestamp
    if (this.showTimestamps) {
      parts.push(`${dim}${entry.timestamp.toISOString()}${reset}`);
    }

    // Level with color
    parts.push(`${color}[${levelName}]${reset}`);

    // Request ID (shortened for readability)
    if (entry.tags.requestId && entry.tags.requestId !== 'global') {
      const shortId = String(entry.tags.requestId).slice(0, 8);
      parts.push(`${dim}[${shortId}]${reset}`);
    }

    // Message
    parts.push(entry.message);

    // Tags (excluding requestId which is already shown)
    const tagEntries = Object.entries(entry.tags).filter(
      ([key, value]) => key !== 'requestId' && value !== undefined && value !== null
    );
    if (tagEntries.length > 0) {
      const tagStr = tagEntries.map(([k, v]) => `${k}=${v}`).join(' ');
      parts.push(`${dim}${tagStr}${reset}`);
    }

    // Output the main line
    const line = parts.join(' ');

    // Use appropriate console method based on level
    if (entry.level >= LogLevel.ERROR) {
      console.error(line);
    } else if (entry.level === LogLevel.WARN) {
      console.warn(line);
    } else {
      console.log(line);
    }

    // Output error stack trace if present
    if (entry.error && this.showStackTraces) {
      const serialized = serializeError(entry.error);
      console.error(`${color}  ${serialized.name}: ${serialized.message}${reset}`);
      if (serialized.stack) {
        // Indent stack trace lines
        const stackLines = serialized.stack.split('\n').slice(1); // Skip first line (already shown)
        for (const stackLine of stackLines) {
          console.error(`${dim}  ${stackLine.trim()}${reset}`);
        }
      }
    }

    // Output data if present
    if (entry.data !== undefined) {
      console.log(`${dim}  data:${reset}`, entry.data);
    }
  }
}

