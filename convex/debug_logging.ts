/**
 * Debug function to test Better Stack log forwarding
 * 
 * Usage:
 *   npx convex run debug_logging:testBetterStack
 */

import { internalAction } from "./_generated/server";
import { createLogger } from "./logger";

export const testBetterStack = internalAction({
  handler: async () => {
    const logtailUrl = process.env.BETTER_STACK_LOGTAIL_URL || process.env.LOGTAIL_URL;
    const logtailToken = process.env.BETTER_STACK_LOGTAIL_TOKEN || process.env.LOGTAIL_TOKEN;
    
    console.log("=== Better Stack Debug Test ===");
    console.log("BETTER_STACK_LOGTAIL_URL configured:", !!logtailUrl);
    console.log("BETTER_STACK_LOGTAIL_TOKEN configured:", !!logtailToken);
    
    // Fail fast if either env var is missing
    if (!logtailUrl || !logtailToken) {
      const missing = [];
      if (!logtailUrl) missing.push("BETTER_STACK_LOGTAIL_URL");
      if (!logtailToken) missing.push("BETTER_STACK_LOGTAIL_TOKEN");
      
      console.log(`\n❌ Missing required environment variables: ${missing.join(", ")}`);
      console.log("\nSet them with:");
      console.log("  npx convex env set BETTER_STACK_LOGTAIL_URL https://s1672698.eu-nbg-2.betterstackdata.com");
      console.log("  npx convex env set BETTER_STACK_LOGTAIL_TOKEN YOUR_TOKEN");
      console.log("\nGet your endpoint URL and token from Better Stack dashboard:");
      console.log("  Sources → Add Source → HTTP endpoint");
      
      return {
        success: false,
        error: `Missing environment variables: ${missing.join(", ")}`,
        logtailUrlConfigured: !!logtailUrl,
        logtailTokenConfigured: !!logtailToken,
        message: "Both BETTER_STACK_LOGTAIL_URL and BETTER_STACK_LOGTAIL_TOKEN must be set for log forwarding to work",
      };
    }
    
    if (logtailUrl) {
      console.log("URL starts with:", logtailUrl.substring(0, 30) + "...");
    }
    
    const logger = createLogger({ 
      debugTest: true,
      timestamp: new Date().toISOString(),
    }, "convex");

    console.log("\nSending test logs...");
    
    // In actions, we can await the forwarding (it's async now)
    // But logger methods are sync, so we'll just call them and let the forwarding happen
    logger.info("🔍 DEBUG TEST: Info log", {
      testId: "debug-001",
      message: "This is a debug test info log",
    });

    // Give time for the fetch to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.warn("🔍 DEBUG TEST: Warning log", {
      testId: "debug-002",
      message: "This is a debug test warning log",
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.error("🔍 DEBUG TEST: Error log", {
      testId: "debug-003",
      message: "This is a debug test error log",
    }, new Error("Debug test error"));

    // Give final fetch time to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("\n✅ Test logs sent! Check:");
    console.log("   1. Convex dashboard logs (should see debug messages)");
    console.log("   2. Better Stack dashboard (should see logs with 'debugTest: true')");
    console.log("   3. Look for '[Logger Debug]' messages in Convex logs");

    return {
      success: true,
      logtailUrlConfigured: true,
      logtailTokenConfigured: true,
      message: "Test logs sent. Check Better Stack dashboard in a few seconds for logs with 'debugTest: true'",
    };
  },
});
