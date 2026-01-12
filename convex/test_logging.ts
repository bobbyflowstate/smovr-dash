/**
 * Test function to verify Better Stack log forwarding from Convex
 * 
 * Usage:
 *   In Convex dashboard: Functions → test_logging → testLogging → Run
 *   Or CLI: npx convex run test_logging:testLogging
 */

import { internalAction } from "./_generated/server";
import { createLogger, logWebhookSuccess, logWebhookFailure, logCronStart, logCronComplete } from "./logger";

export const testLogging = internalAction({
  handler: async () => {
    const logger = createLogger({ 
      test: true,
      environment: "local",
      testRun: new Date().toISOString(),
    }, "convex");

    logger.info("🧪 Testing Better Stack log forwarding - INFO log", {
      testType: "info",
      message: "This is a test info log",
    });

    // Small delay to ensure logs are sent
    await new Promise(resolve => setTimeout(resolve, 500));

    logger.warn("🧪 Testing Better Stack log forwarding - WARN log", {
      testType: "warn",
      message: "This is a test warning log",
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    logger.error("🧪 Testing Better Stack log forwarding - ERROR log", {
      testType: "error",
      message: "This is a test error log",
    }, new Error("Test error for logging verification"));

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test convenience functions
    logWebhookSuccess("+15551234567", "Test message", 1, {
      testType: "webhook_success",
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    logWebhookFailure("+15551234567", new Error("Test webhook failure"), 3, 3, {
      testType: "webhook_failure",
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    logCronStart("testCron", { testType: "cron_start" });

    await new Promise(resolve => setTimeout(resolve, 500));

    logCronComplete("testCron", {
      testType: "cron_complete",
      processed: 10,
      success: 8,
      failed: 2,
    });

    return {
      success: true,
      message: "Test logs sent! Check Better Stack dashboard in a few seconds.",
      instructions: "Look for logs with 'test: true' in the context and 'source: convex'",
    };
  },
});
