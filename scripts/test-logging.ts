/**
 * Test script to verify Better Stack log forwarding
 * 
 * Usage:
 *   For Convex: npx convex run debug_logging:testBetterStack
 *   OR: npx convex run test_logging:testLogging
 *   For Next.js: npx tsx scripts/test-logging.ts
 *   OR: LOG_SOURCE=vercel npx tsx scripts/test-logging.ts (to explicitly test Vercel forwarding)
 * 
 * Note: Requires tsx to run TypeScript files directly:
 *   npm install -D tsx
 *   OR use: npx tsx scripts/test-logging.ts
 */

import { createLogger } from "../convex/logger";

async function testLogging() {
  console.log("🧪 Testing Better Stack log forwarding...\n");

  // Use explicit LOG_SOURCE env var, or default to "vercel" for Next.js test script
  // CONVEX_URL is always set in Next.js environments, so can't use it to detect source
  const logSource = (process.env.LOG_SOURCE as "convex" | "vercel") || "vercel";

  const logger = createLogger({ 
    test: true,
    environment: process.env.NODE_ENV || "local"
  }, logSource);
  
  console.log(`📝 Log source: ${logSource}`);

  // Test different log levels
  console.log("1. Testing INFO log...");
  logger.info("Test info log from logging test script", {
    testType: "info",
    timestamp: new Date().toISOString(),
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("2. Testing WARN log...");
  logger.warn("Test warning log from logging test script", {
    testType: "warn",
    timestamp: new Date().toISOString(),
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("3. Testing ERROR log...");
  logger.error("Test error log from logging test script", {
    testType: "error",
    timestamp: new Date().toISOString(),
  }, new Error("Test error for logging verification"));

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("4. Testing DEBUG log...");
  logger.debug("Test debug log from logging test script", {
    testType: "debug",
    timestamp: new Date().toISOString(),
  });

  console.log("\n✅ Test logs sent! Check Better Stack dashboard in a few seconds.");
  console.log("   Look for logs with 'test: true' in the context.");
}

// Run if executed directly (tsx will execute this)
testLogging().catch(console.error);

export { testLogging };
