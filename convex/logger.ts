/**
 * Structured logging utility for Convex functions and Next.js API routes
 * 
 * Provides consistent logging with severity levels, context, and structured data.
 * 
 * For Convex: Logs output JSON via console.log, which Convex streams to external services
 * via native log streaming (configure in Dashboard → Integrations).
 * 
 * For Next.js: Logs forward to Better Stack via HTTP (if BETTER_STACK_LOGTAIL_URL is set).
 * 
 * Usage:
 * - In Convex: import { createLogger } from "./logger"
 * - In Next.js: import { createLogger } from "../../convex/logger"
 * 
 * NOTE: Convex mutations/queries cannot reliably execute HTTP requests, so manual forwarding
 * is disabled for Convex. Use Convex's native log streaming instead (Dashboard → Integrations).
 */

import { Id } from "./_generated/dataModel";

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogSource = "convex" | "vercel";

export interface LogContext {
  userId?: string;
  teamId?: Id<"teams"> | string;
  appointmentId?: Id<"appointments"> | string;
  patientId?: Id<"patients"> | string;
  action?: string;
  operation?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  source: LogSource;
}

/**
 * Creates a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error,
  source: LogSource = "convex"
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
    source,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return entry;
}

/**
 * Formats log entry for console output (structured JSON for log drains)
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Forwards log entry to Better Stack (Logtail)
 * 
 * Convex functions CAN make HTTP calls - we do it all the time (see webhook_utils.ts).
 * The issue was the payload format, not HTTP capability.
 */
async function forwardToBetterStack(entry: LogEntry): Promise<void> {
  // Better Stack requires:
  // 1. Endpoint URL (e.g., https://s1672698.eu-nbg-2.betterstackdata.com)
  // 2. Bearer token in Authorization header
  // 3. dt field in format: "YYYY-MM-DD HH:MM:SS UTC"
  
  const logtailUrl = process.env.BETTER_STACK_LOGTAIL_URL || process.env.LOGTAIL_URL;
  const logtailToken = process.env.BETTER_STACK_LOGTAIL_TOKEN || process.env.LOGTAIL_TOKEN;
  
  // Require both endpoint URL and token explicitly
  // Legacy format (https://in.logtail.com/TOKEN) is no longer supported
  // Users must set BETTER_STACK_LOGTAIL_URL and BETTER_STACK_LOGTAIL_TOKEN separately
  if (!logtailUrl || !logtailToken) {
    return;
  }
  
  const endpointUrl = logtailUrl;
  const token = logtailToken;

  try {
    // Format dt as "YYYY-MM-DD HH:MM:SS UTC" (Better Stack format)
    const dt = new Date(entry.timestamp)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, ' UTC');
    
    const betterStackPayload = {
      dt: dt,
      message: entry.message,
      level: entry.level,
      ...entry.context,
      ...(entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack,
        },
      }),
      source: entry.source,
    };

    await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(betterStackPayload),
    });
  } catch (error) {
    // Silently fail - don't let log forwarding errors break the app
    // But log to console in dev so we can debug
    if (process.env.CONVEX_ENV !== "prod" && process.env.NODE_ENV !== "production") {
      console.error("[Logger] Failed to forward to Better Stack:", error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private context: LogContext;
  private source: LogSource;

  constructor(context: LogContext = {}, source: LogSource = "convex") {
    this.context = context;
    this.source = source;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext }, this.source);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    const entry = createLogEntry("info", message, { ...this.context, ...context }, undefined, this.source);
    console.log(formatLogEntry(entry));
    // Forward to Better Stack
    // In actions: Will be awaited (if called with await)
    // In mutations/queries: Fire-and-forget (may not execute)
    forwardToBetterStack(entry).catch(() => {
      // Silently ignore errors
    });
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext, error?: Error): void {
    const entry = createLogEntry("warn", message, { ...this.context, ...context }, error, this.source);
    console.warn(formatLogEntry(entry));
    // Forward to Better Stack
    forwardToBetterStack(entry).catch(() => {
      // Silently ignore errors
    });
  }

  /**
   * Log error message
   */
  error(message: string, context?: LogContext, error?: Error): void {
    const entry = createLogEntry("error", message, { ...this.context, ...context }, error, this.source);
    console.error(formatLogEntry(entry));
    // Forward to Better Stack
    forwardToBetterStack(entry).catch(() => {
      // Silently ignore errors
    });
  }

  /**
   * Log debug message (only in dev/local)
   */
  debug(message: string, context?: LogContext): void {
    const entry = createLogEntry("debug", message, { ...this.context, ...context }, undefined, this.source);
    // Only log debug in development
    const isDev = process.env.CONVEX_ENV !== "prod" && process.env.NODE_ENV !== "production";
    if (isDev) {
      console.log(formatLogEntry(entry));
      // Forward debug logs too (they'll be filtered by Better Stack if needed)
      forwardToBetterStack(entry).catch(() => {
        // Silently ignore errors
      });
    }
  }
}

/**
 * Create a logger instance
 * 
 * @param context - Optional context to include in all logs
 * @param source - Log source: "convex" for Convex functions, "vercel" for Next.js API routes
 */
export function createLogger(context?: LogContext, source: LogSource = "convex"): Logger {
  return new Logger(context, source);
}

/**
 * Convenience functions for common logging scenarios
 */

export function logWebhookSuccess(
  phone: string,
  message: string,
  attempt: number = 1,
  context?: LogContext,
  source: LogSource = "convex"
): void {
  const logger = createLogger(context, source);
  logger.info("Webhook sent successfully", {
    ...context,
    phone: phone.replace(/(\d{3})(\d{3})(\d{4})/, "***-***-$3"), // Partial phone masking
    attempt,
    messageLength: message.length,
  });
}

export function logWebhookFailure(
  phone: string,
  error: Error | string,
  attempt: number,
  maxRetries: number,
  context?: LogContext,
  source: LogSource = "convex"
): void {
  const logger = createLogger(context, source);
  const errorObj = typeof error === "string" ? new Error(error) : error;
  
  if (attempt < maxRetries) {
    logger.warn("Webhook failed, will retry", {
      ...context,
      phone: phone.replace(/(\d{3})(\d{3})(\d{4})/, "***-***-$3"),
      attempt,
      maxRetries,
    }, errorObj);
  } else {
    logger.error("Webhook failed after all retries", {
      ...context,
      phone: phone.replace(/(\d{3})(\d{3})(\d{4})/, "***-***-$3"),
      attempt,
      maxRetries,
    }, errorObj);
  }
}

export function logReminderSent(
  reminderType: "24h" | "1h",
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  teamId: Id<"teams">,
  success: boolean,
  context?: LogContext
): void {
  const logger = createLogger({ appointmentId, patientId, teamId, ...context });
  
  if (success) {
    logger.info(`Reminder sent: ${reminderType}`, {
      reminderType,
      appointmentId,
      patientId,
      teamId,
    });
  } else {
    logger.error(`Reminder failed: ${reminderType}`, {
      reminderType,
      appointmentId,
      patientId,
      teamId,
    });
  }
}

export function logAppointmentCreated(
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  teamId: Id<"teams">,
  dateTime: string,
  context?: LogContext
): void {
  const logger = createLogger({ appointmentId, patientId, teamId, ...context });
  logger.info("Appointment created", {
    appointmentId,
    patientId,
    teamId,
    dateTime,
  });
}

export function logAppointmentCanceled(
  appointmentId: Id<"appointments">,
  patientId: Id<"patients">,
  teamId: Id<"teams">,
  context?: LogContext
): void {
  const logger = createLogger({ appointmentId, patientId, teamId, ...context });
  logger.info("Appointment canceled", {
    appointmentId,
    patientId,
    teamId,
  });
}

export function logAuthFailure(
  reason: string,
  email?: string,
  context?: LogContext,
  source: LogSource = "convex"
): void {
  const logger = createLogger(context, source);
  logger.warn("Authentication failure", {
    reason,
    email: email?.replace(/(.{2})(.*)(@.*)/, "$1***$3"), // Partial email masking
  });
}

export function logAuthSuccess(
  email: string,
  userId: string,
  teamId?: Id<"teams"> | string,
  context?: LogContext,
  source: LogSource = "convex"
): void {
  const logger = createLogger({ userId, teamId, ...context }, source);
  logger.info("Authentication success", {
    email: email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
    userId,
    teamId,
  });
}

export function logAuthorizationFailure(
  reason: string,
  userId?: string,
  teamId?: Id<"teams"> | string,
  resourceId?: string,
  context?: LogContext,
  source: LogSource = "convex"
): void {
  const logger = createLogger({ userId, teamId, ...context }, source);
  logger.warn("Authorization failure", {
    reason,
    userId,
    teamId,
    resourceId,
  });
}

export function logCronStart(cronName: string, context?: LogContext): void {
  const logger = createLogger(context);
  logger.info(`Cron job started: ${cronName}`, { cronName });
}

export function logCronComplete(
  cronName: string,
  stats: Record<string, number | string | boolean>,
  context?: LogContext
): void {
  const logger = createLogger(context);
  logger.info(`Cron job completed: ${cronName}`, {
    cronName,
    ...stats,
  });
}

export function logCronError(
  cronName: string,
  error: Error,
  context?: LogContext
): void {
  const logger = createLogger(context);
  logger.error(`Cron job error: ${cronName}`, { cronName }, error);
}

export function logConfigurationError(
  configKey: string,
  reason: string,
  context?: LogContext
): void {
  const logger = createLogger(context);
  logger.error("Configuration error", {
    configKey,
    reason,
  });
}
