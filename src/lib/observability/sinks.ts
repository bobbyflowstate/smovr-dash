/**
 * Sink Interface & Registry
 *
 * Sinks are the output destinations for log entries.
 * The SinkRegistry manages multiple sinks and dispatches entries to each.
 */

import { LogEntry, LogLevel } from './types';

/**
 * LogSink interface - all sinks implement this.
 *
 * Sinks receive LogEntry objects and write them to their destination
 * (console, file, external service, etc.)
 */
export interface LogSink {
  /** Unique name for this sink (used for registration/unregistration) */
  name: string;

  /** Minimum log level this sink will accept. Entries below this are filtered out. */
  minLevel: LogLevel;

  /**
   * Write a log entry to this sink.
   * Can be sync or async - async writes are tracked for flushing.
   */
  write(entry: LogEntry): void | Promise<void>;

  /**
   * Optional: Flush any buffered entries.
   * Called when the registry needs to ensure all logs are written.
   */
  flush?(): Promise<void>;

  /**
   * Optional: Clean up resources when sink is unregistered.
   */
  destroy?(): void;
}

/**
 * SinkRegistry - manages multiple sinks and dispatches log entries.
 *
 * Acts as the "producer" side of the producer/consumer model:
 * - Logger produces LogEntry objects
 * - SinkRegistry dispatches to registered sinks (consumers)
 */
export class SinkRegistry {
  private sinks: LogSink[] = [];
  private asyncQueue: Promise<void>[] = [];

  /**
   * Register a new sink.
   * Sinks are invoked in registration order.
   */
  register(sink: LogSink): void {
    // Prevent duplicate registration
    if (this.sinks.some((s) => s.name === sink.name)) {
      console.warn(`Sink "${sink.name}" is already registered, skipping.`);
      return;
    }
    this.sinks.push(sink);
  }

  /**
   * Unregister a sink by name.
   * Calls destroy() on the sink if available.
   */
  unregister(name: string): void {
    const index = this.sinks.findIndex((s) => s.name === name);
    if (index !== -1) {
      const [sink] = this.sinks.splice(index, 1);
      sink.destroy?.();
    }
  }

  /**
   * Get a registered sink by name.
   */
  getSink(name: string): LogSink | undefined {
    return this.sinks.find((s) => s.name === name);
  }

  /**
   * Get all registered sink names.
   */
  getSinkNames(): string[] {
    return this.sinks.map((s) => s.name);
  }

  /**
   * Dispatch a log entry to all registered sinks.
   * Filters by each sink's minLevel.
   * Async writes are queued for later flushing.
   */
  dispatch(entry: LogEntry): void {
    for (const sink of this.sinks) {
      // Skip if entry level is below sink's minimum
      if (entry.level < sink.minLevel) {
        continue;
      }

      try {
        const result = sink.write(entry);

        // Track async writes for flushing
        if (result instanceof Promise) {
          this.asyncQueue.push(
            result.catch((err) => {
              // Log sink failures to console (avoid recursive logging)
              console.error(`[SinkRegistry] Sink "${sink.name}" write failed:`, err);
            })
          );
        }
      } catch (err) {
        // Sync write failed - log to console
        console.error(`[SinkRegistry] Sink "${sink.name}" threw:`, err);
      }
    }
  }

  /**
   * Flush all pending async writes and call flush() on each sink.
   * Call this before process exit or at end of request to ensure logs are written.
   */
  async flush(): Promise<void> {
    // Wait for all queued async writes
    await Promise.all(this.asyncQueue);
    this.asyncQueue = [];

    // Call flush on each sink that supports it
    const flushPromises = this.sinks
      .filter((s) => s.flush)
      .map((s) => s.flush!().catch((err) => {
        console.error(`[SinkRegistry] Sink "${s.name}" flush failed:`, err);
      }));

    await Promise.all(flushPromises);
  }

  /**
   * Unregister all sinks and clean up.
   */
  destroy(): void {
    for (const sink of this.sinks) {
      sink.destroy?.();
    }
    this.sinks = [];
    this.asyncQueue = [];
  }
}

