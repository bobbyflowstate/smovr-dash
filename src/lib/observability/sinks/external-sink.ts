/**
 * External Sink
 *
 * Sends logs to external services (DataDog, Logtail, Axiom, etc.) with buffering.
 *
 * Key features for serverless environments:
 * 1. Console fallback - ALL logs are also written to console immediately,
 *    ensuring no data loss even if the external service call fails.
 * 2. Buffered batching - Logs are batched for efficient network usage.
 * 3. Flush on demand - Call flush() at end of request (via waitUntil).
 * 4. Retry with backoff - Transient failures are retried.
 */

import { LogSink } from '../sinks';
import { LogEntry, LogLevel, LogLevelNames, serializeError } from '../types';

export interface ExternalSinkOptions {
  /** Unique name for this sink instance. */
  name: string;
  /** Minimum log level to send externally. Defaults to DEBUG (all logs). */
  minLevel?: LogLevel;
  /** The HTTP endpoint to POST logs to. */
  endpoint: string;
  /** API key or bearer token for authentication. */
  apiKey: string;
  /** Header name for the API key. Defaults to 'Authorization' with 'Bearer' prefix. */
  authHeader?: string;
  /** Number of logs to batch before sending. Defaults to 50. */
  batchSize?: number;
  /** Max time (ms) to wait before flushing partial batch. Defaults to 5000. */
  flushIntervalMs?: number;
  /** Request timeout in ms. Defaults to 10000. */
  timeoutMs?: number;
  /** Number of retry attempts. Defaults to 2. */
  maxRetries?: number;
  /**
   * Transform function to convert LogEntry to your service's format.
   * Defaults to a standard structured format.
   */
  transform?: (entry: LogEntry) => unknown;
  /**
   * Whether to also write to console as fallback.
   * Defaults to true - ensures no log loss in serverless.
   */
  consoleFallback?: boolean;
  /**
   * Additional static fields to include in every log.
   */
  staticFields?: Record<string, unknown>;
}

/**
 * Default transform function for external services.
 */
function defaultTransform(entry: LogEntry, staticFields: Record<string, unknown> = {}): Record<string, unknown> {
  const record: Record<string, unknown> = {
    timestamp: entry.timestamp.toISOString(),
    level: LogLevelNames[entry.level].toLowerCase(),
    message: entry.message,
    ...staticFields,
    ...entry.tags,
  };

  if (entry.error) {
    record.error = serializeError(entry.error);
  }

  if (entry.data !== undefined) {
    record.data = entry.data;
  }

  return record;
}

export class ExternalSink implements LogSink {
  readonly name: string;
  readonly minLevel: LogLevel;

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly authHeader: string;
  private readonly batchSize: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly transform: (entry: LogEntry) => unknown;
  private readonly consoleFallback: boolean;
  private readonly staticFields: Record<string, unknown>;

  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(options: ExternalSinkOptions) {
    this.name = options.name;
    this.minLevel = options.minLevel ?? LogLevel.DEBUG;
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.authHeader = options.authHeader ?? 'Authorization';
    this.batchSize = options.batchSize ?? 50;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.maxRetries = options.maxRetries ?? 2;
    this.staticFields = options.staticFields ?? {};
    this.transform = options.transform ?? ((e) => defaultTransform(e, this.staticFields));
    this.consoleFallback = options.consoleFallback ?? true;

    // Start periodic flush timer if configured
    if (options.flushIntervalMs && options.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          console.error(`[${this.name}] Periodic flush failed:`, err);
        });
      }, options.flushIntervalMs);
    }
  }

  /**
   * Write a log entry.
   *
   * 1. Always writes to console if consoleFallback is enabled (default).
   * 2. Adds to buffer for batched external delivery.
   * 3. Triggers flush if buffer reaches batchSize.
   */
  write(entry: LogEntry): void {
    // Console fallback - immediate, synchronous, no data loss
    if (this.consoleFallback) {
      this.writeToConsole(entry);
    }

    // Add to buffer
    this.buffer.push(entry);

    // Trigger flush if batch is full
    if (this.buffer.length >= this.batchSize) {
      // Fire and forget - we have console fallback
      this.flush().catch((err) => {
        console.error(`[${this.name}] Batch flush failed:`, err);
      });
    }
  }

  /**
   * Flush all buffered logs to the external service.
   * Call this at the end of each request in serverless environments.
   *
   * Returns a promise that resolves when the flush is complete.
   * Safe to call multiple times - concurrent calls are coalesced.
   */
  async flush(): Promise<void> {
    // Coalesce concurrent flush calls
    if (this.flushPromise) {
      return this.flushPromise;
    }

    if (this.buffer.length === 0) {
      return;
    }

    this.flushPromise = this.doFlush();

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  /**
   * Internal flush implementation.
   */
  private async doFlush(): Promise<void> {
    // Take all buffered entries
    const batch = this.buffer.splice(0, this.buffer.length);

    if (batch.length === 0) {
      return;
    }

    // Transform entries
    const payload = batch.map(this.transform);

    // Attempt to send with retries
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Exponential backoff for retries
        if (attempt > 0) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await this.sleep(backoffMs);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              [this.authHeader]: this.authHeader === 'Authorization'
                ? `Bearer ${this.apiKey}`
                : this.apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            // Success
            return;
          }

          // Non-retryable status codes
          if (response.status >= 400 && response.status < 500) {
            console.error(
              `[${this.name}] External service rejected logs (${response.status}):`,
              await response.text().catch(() => 'unknown')
            );
            // Don't retry client errors - logs are already in console fallback
            return;
          }

          // Retryable server error
          lastError = new Error(`HTTP ${response.status}`);
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error('Request timeout');
        } else if (err instanceof Error) {
          lastError = err;
        } else {
          lastError = new Error(String(err));
        }
      }
    }

    // All retries failed - logs are safe in console fallback
    console.error(
      `[${this.name}] Failed to send ${batch.length} logs after ${this.maxRetries + 1} attempts:`,
      lastError?.message
    );
  }

  /**
   * Write a log entry to console (fallback).
   */
  private writeToConsole(entry: LogEntry): void {
    const record = this.transform(entry);
    const json = JSON.stringify(record);

    if (entry.level >= LogLevel.ERROR) {
      console.error(json);
    } else if (entry.level === LogLevel.WARN) {
      console.warn(json);
    } else {
      console.log(json);
    }
  }

  /**
   * Sleep helper for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

