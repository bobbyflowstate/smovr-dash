import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  LogLevel,
  LogLevelNames,
  LogEntry,
  LogContext,
  serializeError,
} from "../src/lib/observability/types";
import { SinkRegistry, LogSink } from "../src/lib/observability/sinks";
import { Logger } from "../src/lib/observability/logger";
import { ConsoleSink } from "../src/lib/observability/sinks/console-sink";
import { JsonSink } from "../src/lib/observability/sinks/json-sink";
import {
  initializeContext,
  runWithContext,
  getCurrentContext,
  hasContext,
  extendContext,
  getLogger,
  createChildLogger,
  generateRequestId,
  createRequestContext,
} from "../src/lib/observability/context";

// ============================================================================
// Types Tests
// ============================================================================

describe("observability/types", () => {
  describe("LogLevel", () => {
    it("has correct numeric ordering", () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
      expect(LogLevel.FATAL).toBe(4);
    });

    it("allows level comparison", () => {
      expect(LogLevel.ERROR > LogLevel.INFO).toBe(true);
      expect(LogLevel.DEBUG < LogLevel.WARN).toBe(true);
    });
  });

  describe("LogLevelNames", () => {
    it("maps levels to string names", () => {
      expect(LogLevelNames[LogLevel.DEBUG]).toBe("DEBUG");
      expect(LogLevelNames[LogLevel.INFO]).toBe("INFO");
      expect(LogLevelNames[LogLevel.WARN]).toBe("WARN");
      expect(LogLevelNames[LogLevel.ERROR]).toBe("ERROR");
      expect(LogLevelNames[LogLevel.FATAL]).toBe("FATAL");
    });
  });

  describe("serializeError", () => {
    it("extracts name, message, and stack", () => {
      const error = new Error("Something went wrong");
      const serialized = serializeError(error);

      expect(serialized.name).toBe("Error");
      expect(serialized.message).toBe("Something went wrong");
      expect(serialized.stack).toBeDefined();
      expect(serialized.stack).toContain("Something went wrong");
    });

    it("handles custom error types", () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }

      const error = new CustomError("Custom failure");
      const serialized = serializeError(error);

      expect(serialized.name).toBe("CustomError");
      expect(serialized.message).toBe("Custom failure");
    });
  });
});

// ============================================================================
// SinkRegistry Tests
// ============================================================================

describe("observability/sinks", () => {
  describe("SinkRegistry", () => {
    let registry: SinkRegistry;

    beforeEach(() => {
      registry = new SinkRegistry();
    });

    it("registers sinks", () => {
      const sink = createMockSink("test-sink");
      registry.register(sink);
      expect(registry.getSinkNames()).toContain("test-sink");
    });

    it("prevents duplicate registration", () => {
      const sink1 = createMockSink("test-sink");
      const sink2 = createMockSink("test-sink");

      registry.register(sink1);
      registry.register(sink2);

      expect(registry.getSinkNames()).toEqual(["test-sink"]);
    });

    it("unregisters sinks and calls destroy", () => {
      const sink = createMockSink("test-sink");
      registry.register(sink);
      registry.unregister("test-sink");

      expect(registry.getSinkNames()).not.toContain("test-sink");
      expect(sink.destroy).toHaveBeenCalled();
    });

    it("dispatches to all registered sinks", () => {
      const sink1 = createMockSink("sink1");
      const sink2 = createMockSink("sink2");
      registry.register(sink1);
      registry.register(sink2);

      const entry = createLogEntry(LogLevel.INFO, "test message");
      registry.dispatch(entry);

      expect(sink1.write).toHaveBeenCalledWith(entry);
      expect(sink2.write).toHaveBeenCalledWith(entry);
    });

    it("filters by minLevel", () => {
      const sink = createMockSink("test-sink", LogLevel.WARN);
      registry.register(sink);

      const debugEntry = createLogEntry(LogLevel.DEBUG, "debug");
      const infoEntry = createLogEntry(LogLevel.INFO, "info");
      const warnEntry = createLogEntry(LogLevel.WARN, "warn");
      const errorEntry = createLogEntry(LogLevel.ERROR, "error");

      registry.dispatch(debugEntry);
      registry.dispatch(infoEntry);
      registry.dispatch(warnEntry);
      registry.dispatch(errorEntry);

      expect(sink.write).toHaveBeenCalledTimes(2);
      expect(sink.write).toHaveBeenCalledWith(warnEntry);
      expect(sink.write).toHaveBeenCalledWith(errorEntry);
    });

    it("flushes all sinks", async () => {
      const sink = createMockSink("test-sink");
      registry.register(sink);

      await registry.flush();

      expect(sink.flush).toHaveBeenCalled();
    });

    it("handles async sink writes", async () => {
      const writePromise = Promise.resolve();
      const sink: LogSink = {
        name: "async-sink",
        minLevel: LogLevel.DEBUG,
        write: vi.fn(() => writePromise),
        flush: vi.fn(() => Promise.resolve()),
      };
      registry.register(sink);

      const entry = createLogEntry(LogLevel.INFO, "test");
      registry.dispatch(entry);

      await registry.flush();
      expect(sink.write).toHaveBeenCalledWith(entry);
    });

    it("catches sync write errors without crashing", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const sink: LogSink = {
        name: "error-sink",
        minLevel: LogLevel.DEBUG,
        write: vi.fn(() => {
          throw new Error("Write failed");
        }),
      };
      registry.register(sink);

      const entry = createLogEntry(LogLevel.INFO, "test");
      expect(() => registry.dispatch(entry)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

// ============================================================================
// Logger Tests
// ============================================================================

describe("observability/logger", () => {
  let registry: SinkRegistry;
  let mockSink: ReturnType<typeof createMockSink>;

  beforeEach(() => {
    registry = new SinkRegistry();
    mockSink = createMockSink("test-sink");
    registry.register(mockSink);
  });

  describe("Logger", () => {
    it("logs debug messages", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      logger.debug("Debug message");

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.DEBUG,
          message: "Debug message",
          tags: expect.objectContaining({ requestId: "test-123" }),
        })
      );
    });

    it("logs info messages", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      logger.info("Info message");

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: "Info message",
        })
      );
    });

    it("logs warn messages", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      logger.warn("Warn message");

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.WARN,
          message: "Warn message",
        })
      );
    });

    it("logs error messages with Error object", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      const error = new Error("Something failed");
      logger.error("Error occurred", error);

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: "Error occurred",
          error: error,
        })
      );
    });

    it("logs error messages with non-Error data", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      logger.error("Error occurred", { code: 500, detail: "Server error" });

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: "Error occurred",
          data: { code: 500, detail: "Server error" },
        })
      );
    });

    it("logs fatal messages", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      logger.fatal("Fatal error", new Error("Crash"));

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.FATAL,
          message: "Fatal error",
        })
      );
    });

    it("merges tags with context", () => {
      const logger = new Logger(registry, { requestId: "test-123", userEmail: "user@test.com" });
      logger.info("Message", { action: "create", recordId: 456 });

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            requestId: "test-123",
            userEmail: "user@test.com",
            action: "create",
            recordId: 456,
          },
        })
      );
    });

    it("includes data payload", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      logger.info("Message", undefined, { items: [1, 2, 3] });

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { items: [1, 2, 3] },
        })
      );
    });

    it("creates child loggers with extended context", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      const childLogger = logger.child({ operation: "sendReminder" });

      childLogger.info("Child message");

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            requestId: "test-123",
            operation: "sendReminder",
          },
        })
      );
    });

    it("child logger does not affect parent", () => {
      const logger = new Logger(registry, { requestId: "test-123" });
      logger.child({ operation: "sendReminder" });

      logger.info("Parent message");

      expect(mockSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            requestId: "test-123",
            // operation should NOT be here
          },
        })
      );
      expect((mockSink.write as ReturnType<typeof vi.fn>).mock.calls[0][0].tags.operation).toBeUndefined();
    });

    it("returns context copy", () => {
      const logger = new Logger(registry, { requestId: "test-123", userEmail: "user@test.com" });
      const context = logger.getContext();

      expect(context).toEqual({ requestId: "test-123", userEmail: "user@test.com" });

      // Modifying the copy should not affect the logger
      context.requestId = "modified";
      expect(logger.getContext().requestId).toBe("test-123");
    });
  });
});

// ============================================================================
// Console Sink Tests
// ============================================================================

describe("observability/sinks/console-sink", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("writes to console.log for DEBUG level", () => {
    const sink = new ConsoleSink({ colors: false });
    sink.write(createLogEntry(LogLevel.DEBUG, "debug message"));
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("writes to console.log for INFO level", () => {
    const sink = new ConsoleSink({ colors: false });
    sink.write(createLogEntry(LogLevel.INFO, "info message"));
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("writes to console.warn for WARN level", () => {
    const sink = new ConsoleSink({ colors: false });
    sink.write(createLogEntry(LogLevel.WARN, "warn message"));
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("writes to console.error for ERROR level", () => {
    const sink = new ConsoleSink({ colors: false });
    sink.write(createLogEntry(LogLevel.ERROR, "error message"));
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("writes to console.error for FATAL level", () => {
    const sink = new ConsoleSink({ colors: false });
    sink.write(createLogEntry(LogLevel.FATAL, "fatal message"));
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("includes error stack trace", () => {
    const sink = new ConsoleSink({ colors: false, stackTraces: true });
    const entry = createLogEntry(LogLevel.ERROR, "error message");
    entry.error = new Error("Test error");
    sink.write(entry);
    // Should call console.error multiple times (main line + stack)
    expect(consoleErrorSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it("respects minLevel", () => {
    const sink = new ConsoleSink({ minLevel: LogLevel.WARN, colors: false });
    expect(sink.minLevel).toBe(LogLevel.WARN);
  });
});

// ============================================================================
// JSON Sink Tests
// ============================================================================

describe("observability/sinks/json-sink", () => {
  it("outputs valid JSON", () => {
    const lines: string[] = [];
    const sink = new JsonSink({ writer: (line) => lines.push(line) });

    sink.write(createLogEntry(LogLevel.INFO, "test message"));

    expect(lines.length).toBe(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it("includes all log entry fields", () => {
    const lines: string[] = [];
    const sink = new JsonSink({ writer: (line) => lines.push(line) });

    const entry = createLogEntry(LogLevel.INFO, "test message");
    entry.tags = { requestId: "abc-123", userEmail: "user@test.com" };
    entry.data = { count: 42 };
    sink.write(entry);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("test message");
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.requestId).toBe("abc-123");
    expect(parsed.userEmail).toBe("user@test.com");
    expect(parsed.data).toEqual({ count: 42 });
  });

  it("serializes errors", () => {
    const lines: string[] = [];
    const sink = new JsonSink({ writer: (line) => lines.push(line) });

    const entry = createLogEntry(LogLevel.ERROR, "error occurred");
    entry.error = new Error("Something failed");
    sink.write(entry);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.error).toBeDefined();
    expect(parsed.error.name).toBe("Error");
    expect(parsed.error.message).toBe("Something failed");
    expect(parsed.error.stack).toBeDefined();
  });

  it("includes static fields", () => {
    const lines: string[] = [];
    const sink = new JsonSink({
      writer: (line) => lines.push(line),
      staticFields: { service: "smovr-dash", version: "1.0.0" },
    });

    sink.write(createLogEntry(LogLevel.INFO, "test"));

    const parsed = JSON.parse(lines[0]);
    expect(parsed.service).toBe("smovr-dash");
    expect(parsed.version).toBe("1.0.0");
  });

  it("supports pretty printing", () => {
    const lines: string[] = [];
    const sink = new JsonSink({ writer: (line) => lines.push(line), pretty: true });

    sink.write(createLogEntry(LogLevel.INFO, "test"));

    expect(lines[0]).toContain("\n"); // Pretty-printed JSON has newlines
  });
});

// ============================================================================
// Context Tests
// ============================================================================

describe("observability/context", () => {
  let registry: SinkRegistry;
  let mockSink: ReturnType<typeof createMockSink>;

  beforeEach(() => {
    registry = new SinkRegistry();
    mockSink = createMockSink("test-sink");
    registry.register(mockSink);
    initializeContext(registry);
  });

  describe("generateRequestId", () => {
    it("generates unique UUIDs", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe("runWithContext", () => {
    it("sets context within the callback", () => {
      runWithContext({ requestId: "test-123" }, () => {
        expect(getCurrentContext().requestId).toBe("test-123");
      });
    });

    it("returns the callback result", () => {
      const result = runWithContext({ requestId: "test-123" }, () => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it("works with async callbacks", async () => {
      const result = await runWithContext({ requestId: "test-123" }, async () => {
        await Promise.resolve();
        return getCurrentContext().requestId;
      });
      expect(result).toBe("test-123");
    });

    it("isolates contexts between nested runs", () => {
      runWithContext({ requestId: "outer" }, () => {
        expect(getCurrentContext().requestId).toBe("outer");

        runWithContext({ requestId: "inner" }, () => {
          expect(getCurrentContext().requestId).toBe("inner");
        });

        expect(getCurrentContext().requestId).toBe("outer");
      });
    });
  });

  describe("getCurrentContext", () => {
    it("returns default context when not in runWithContext", () => {
      const context = getCurrentContext();
      expect(context.requestId).toBe("no-context");
    });
  });

  describe("hasContext", () => {
    it("returns false outside runWithContext", () => {
      expect(hasContext()).toBe(false);
    });

    it("returns true inside runWithContext", () => {
      runWithContext({ requestId: "test" }, () => {
        expect(hasContext()).toBe(true);
      });
    });
  });

  describe("extendContext", () => {
    it("adds new tags to current context", () => {
      runWithContext({ requestId: "test-123" }, () => {
        extendContext({ userEmail: "user@test.com" });
        expect(getCurrentContext().userEmail).toBe("user@test.com");
      });
    });

    it("preserves existing context", () => {
      runWithContext({ requestId: "test-123" }, () => {
        extendContext({ userEmail: "user@test.com" });
        expect(getCurrentContext().requestId).toBe("test-123");
      });
    });

    it("does nothing outside runWithContext", () => {
      extendContext({ userEmail: "user@test.com" });
      expect(getCurrentContext().userEmail).toBeUndefined();
    });
  });

  describe("getLogger", () => {
    it("returns a logger with current context", () => {
      runWithContext({ requestId: "test-123", userEmail: "user@test.com" }, () => {
        const logger = getLogger();
        logger.info("test message");

        expect(mockSink.write).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.objectContaining({
              requestId: "test-123",
              userEmail: "user@test.com",
            }),
          })
        );
      });
    });
  });

  describe("createChildLogger", () => {
    it("creates a child logger with extended context", () => {
      runWithContext({ requestId: "test-123" }, () => {
        const childLogger = createChildLogger({ operation: "sendReminder" });
        childLogger.info("child message");

        expect(mockSink.write).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.objectContaining({
              requestId: "test-123",
              operation: "sendReminder",
            }),
          })
        );
      });
    });
  });

  describe("createRequestContext", () => {
    it("creates context with requestId and provided options", () => {
      const context = createRequestContext({
        pathname: "/api/test",
        method: "GET",
      });

      expect(context.requestId).toBeDefined();
      expect(context.pathname).toBe("/api/test");
      expect(context.method).toBe("GET");
    });
  });
});

// ============================================================================
// API Wrapper Tests
// ============================================================================

describe("observability/api-wrapper", () => {
  let registry: SinkRegistry;
  let mockSink: ReturnType<typeof createMockSink>;

  beforeEach(() => {
    registry = new SinkRegistry();
    mockSink = createMockSink("test-sink");
    registry.register(mockSink);
    initializeContext(registry);
  });

  describe("withContext", () => {
    it("creates context for the callback", async () => {
      const { withContext } = await import("../src/lib/observability/context");

      let capturedContext: LogContext | null = null;

      await withContext("test.action", async () => {
        capturedContext = getCurrentContext();
      });

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.requestId).toBeDefined();
      expect(capturedContext!.route).toBe("test.action");
    });

    it("returns the callback result", async () => {
      const { withContext } = await import("../src/lib/observability/context");

      const result = await withContext("test.action", async () => {
        return { success: true, value: 42 };
      });

      expect(result).toEqual({ success: true, value: 42 });
    });

    it("logs start and completion", async () => {
      const { withContext } = await import("../src/lib/observability/context");

      await withContext("test.action", async () => {
        // Do something
      });

      // Should have logged debug start and completion
      const calls = mockSink.write.mock.calls as Array<[LogEntry]>;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      // Check for start log
      const startLog = calls.find((call) => 
        call[0].message === "Context started"
      );
      expect(startLog).toBeDefined();

      // Check for completion log
      const endLog = calls.find((call) => 
        call[0].message === "Context completed"
      );
      expect(endLog).toBeDefined();
    });

    it("logs error and rethrows on failure", async () => {
      const { withContext } = await import("../src/lib/observability/context");

      const testError = new Error("Test failure");

      await expect(
        withContext("test.action", async () => {
          throw testError;
        })
      ).rejects.toThrow("Test failure");

      // Should have logged the error
      const calls = mockSink.write.mock.calls as Array<[LogEntry]>;
      const errorLog = calls.find((call) => call[0].level === LogLevel.ERROR);
      expect(errorLog).toBeDefined();
      expect(errorLog![0].message).toBe("Context failed");
    });

    it("flushes logs after completion", async () => {
      const { withContext } = await import("../src/lib/observability/context");

      await withContext("test.action", async () => {
        // Do something
      });

      expect(mockSink.flush).toHaveBeenCalled();
    });

    it("flushes logs even after error", async () => {
      const { withContext } = await import("../src/lib/observability/context");

      try {
        await withContext("test.action", async () => {
          throw new Error("Test error");
        });
      } catch {
        // Expected
      }

      expect(mockSink.flush).toHaveBeenCalled();
    });

    it("includes timing in completion log", async () => {
      const { withContext } = await import("../src/lib/observability/context");

      await withContext("test.action", async () => {
        // Small delay to ensure measurable duration
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      const calls = mockSink.write.mock.calls as Array<[LogEntry]>;
      const endLog = calls.find((call) => call[0].message === "Context completed");
      expect(endLog).toBeDefined();
      expect(endLog![0].tags.durationMs).toBeDefined();
      expect(typeof endLog![0].tags.durationMs).toBe("number");
    });
  });
});

// ============================================================================
// Convex Logger Tests
// ============================================================================

describe("convex/lib/logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("createConvexLogger", () => {
    it("outputs valid JSON", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test.function" });
      log.info("Test message");

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("includes context in output", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({
        functionName: "reminders.send",
        teamId: "team_123",
        appointmentId: "apt_456",
      });
      log.info("Sending reminder");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.functionName).toBe("reminders.send");
      expect(output.teamId).toBe("team_123");
      expect(output.appointmentId).toBe("apt_456");
    });

    it("includes standard fields", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test.function" });
      log.info("Test message");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.dt).toBeDefined();
      expect(output.level).toBe("info");
      expect(output.message).toBe("Test message");
      expect(output.service).toBe("smovr-dash");
      expect(output.runtime).toBe("convex");
    });

    it("logs debug level to console.log", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test" });
      log.debug("Debug message");

      expect(consoleSpy).toHaveBeenCalled();
      const output = parseConsoleOutput(consoleSpy);
      expect(output.level).toBe("debug");
    });

    it("logs info level to console.log", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test" });
      log.info("Info message");

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("logs warn level to console.warn", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test" });
      log.warn("Warn message");

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("logs error level to console.error", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test" });
      log.error("Error message");

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("includes error details", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test" });
      const error = new Error("Something went wrong");
      log.error("Operation failed", error);

      const output = parseConsoleOutput(consoleErrorSpy);
      expect(output.error_name).toBe("Error");
      expect(output.error_message).toBe("Something went wrong");
      expect(output.error_stack).toBeDefined();
    });

    it("includes extra data in output", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger({ functionName: "test" });
      log.info("Records processed", { count: 42, status: "complete" });

      const output = parseConsoleOutput(consoleSpy);
      expect(output.count).toBe(42);
      expect(output.status).toBe("complete");
    });

    it("respects minLevel option", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const log = createConvexLogger(
        { functionName: "test" },
        { minLevel: "warn" }
      );

      log.debug("Debug message");
      log.info("Info message");
      log.warn("Warn message");
      log.error("Error message");

      // Debug and info should be skipped
      expect(consoleSpy).not.toHaveBeenCalled();
      // Warn and error should be logged
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("child logger", () => {
    it("creates child with additional context", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const parentLog = createConvexLogger({ functionName: "parent" });
      const childLog = parentLog.child({ patientId: "patient_123" });

      childLog.info("Child message");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.functionName).toBe("parent");
      expect(output.patientId).toBe("patient_123");
    });

    it("child does not affect parent", async () => {
      const { createConvexLogger } = await import("../convex/lib/logger");

      const parentLog = createConvexLogger({ functionName: "parent" });
      parentLog.child({ patientId: "patient_123" });

      parentLog.info("Parent message");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.patientId).toBeUndefined();
    });
  });

  describe("convenience helpers", () => {
    it("createQueryLogger sets functionType to query", async () => {
      const { createQueryLogger } = await import("../convex/lib/logger");

      const log = createQueryLogger("appointments.list");
      log.info("Listing appointments");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.functionName).toBe("appointments.list");
      expect(output.functionType).toBe("query");
    });

    it("createMutationLogger sets functionType to mutation", async () => {
      const { createMutationLogger } = await import("../convex/lib/logger");

      const log = createMutationLogger("appointments.create");
      log.info("Creating appointment");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.functionName).toBe("appointments.create");
      expect(output.functionType).toBe("mutation");
    });

    it("createActionLogger sets functionType to action", async () => {
      const { createActionLogger } = await import("../convex/lib/logger");

      const log = createActionLogger("webhooks.send");
      log.info("Sending webhook");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.functionName).toBe("webhooks.send");
      expect(output.functionType).toBe("action");
    });

    it("convenience helpers accept additional context", async () => {
      const { createMutationLogger } = await import("../convex/lib/logger");

      const log = createMutationLogger("appointments.create", {
        teamId: "team_abc",
      });
      log.info("Creating appointment");

      const output = parseConsoleOutput(consoleSpy);
      expect(output.teamId).toBe("team_abc");
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockSink(name: string, minLevel: LogLevel = LogLevel.DEBUG): LogSink & {
  write: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    name,
    minLevel,
    write: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
  };
}

function createLogEntry(level: LogLevel, message: string): LogEntry {
  return {
    level,
    message,
    timestamp: new Date(),
    tags: { requestId: "test-id" },
  };
}

/**
 * Helper to parse JSON from console spy mock calls.
 */
function parseConsoleOutput(spy: ReturnType<typeof vi.spyOn>, callIndex = 0): Record<string, unknown> {
  const output = spy.mock.calls[callIndex]?.[0];
  if (typeof output !== "string") {
    throw new Error(`Expected string at call ${callIndex}, got ${typeof output}`);
  }
  return JSON.parse(output) as Record<string, unknown>;
}
