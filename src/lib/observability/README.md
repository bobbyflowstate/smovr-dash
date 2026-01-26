# Observability System

A unified logging system for smovr-dash that provides structured, context-aware logging across Next.js API routes and Convex backend functions.

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Usage in Next.js](#usage-in-nextjs)
- [Usage in Convex](#usage-in-convex)
- [Log Levels](#log-levels)
- [Log Context & Tags](#log-context--tags)
- [Sinks](#sinks)
- [BetterStack Integration](#betterstack-integration)
- [Design Decisions](#design-decisions)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Code                                │
│                                                                          │
│   Next.js API Routes              │            Convex Functions          │
│   ──────────────────              │            ─────────────────          │
│   withObservability()             │            createMutationLogger()    │
│   runWithContext()                │            createQueryLogger()       │
│   getLogger()                     │            createActionLogger()      │
└──────────────┬────────────────────┴────────────────────┬─────────────────┘
               │                                          │
               ▼                                          ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐
│     Next.js Logger           │          │      Convex Logger           │
│     ──────────────           │          │      ─────────────           │
│  • AsyncLocalStorage context │          │  • Synchronous JSON output   │
│  • Request-scoped metadata   │          │  • Auto-generated requestId  │
│  • Multiple sink dispatch    │          │  • Console capture by Convex │
└──────────────┬───────────────┘          └──────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            Sink Registry                                  │
│                            ─────────────                                  │
│  Dispatches log entries to registered sinks based on minimum log level   │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
       ┌───────┴───────┬────────────────────┐
       ▼               ▼                    ▼
┌─────────────┐ ┌─────────────┐    ┌──────────────────┐
│ ConsoleSink │ │  JsonSink   │    │   ExternalSink   │
│ ─────────── │ │  ────────   │    │   ────────────   │
│ Colored dev │ │ Structured  │    │ Buffered HTTP    │
│ output      │ │ JSON lines  │    │ (BetterStack)    │
└─────────────┘ └─────────────┘    └──────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Logger` | `logger.ts` | Core logger class with level methods |
| `SinkRegistry` | `sinks.ts` | Manages and dispatches to multiple sinks |
| `ConsoleSink` | `sinks/console-sink.ts` | Human-readable console output |
| `JsonSink` | `sinks/json-sink.ts` | Structured JSON output |
| `ExternalSink` | `sinks/external-sink.ts` | Buffered HTTP for external services |
| Context | `context.ts` | AsyncLocalStorage-based request context |
| API Wrapper | `api-wrapper.ts` | HOC for Next.js API routes |
| Convex Logger | `convex/lib/logger.ts` | Standalone logger for Convex functions |

---

## Quick Start

### Next.js API Route

```typescript
import { withObservability, getLogger, extendContext } from '@/lib/observability';

export const GET = withObservability(
  async (request, { params }) => {
    const log = getLogger();
    
    log.info('Processing request');
    
    // Add context as you learn more
    extendContext({ userId: user.id });
    
    log.info('Request complete', { recordCount: 42 });
    
    return NextResponse.json({ success: true });
  },
  { route: 'myEndpoint.get' }
);
```

### Convex Function

```typescript
import { createMutationLogger } from './lib/logger';

export const myMutation = mutation({
  handler: async (ctx, args) => {
    const log = createMutationLogger('myModule.myMutation', {
      userId: args.userId,
    });
    
    log.info('Processing mutation');
    // ... your code
    log.info('Mutation complete', { affected: 5 });
  },
});
```

---

## Environment Variables

### Next.js Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `OFFICE_ID` | Office/tenant identifier - included in all logs for multi-tenant separation | - |
| `BETTERSTACK_SOURCE_TOKEN` | BetterStack source token (enables BetterStack sink) | - |
| `BETTERSTACK_ENDPOINT` | Custom endpoint URL for EU/other regions (e.g., `https://s1234567.eu-nbg-2.betterstackdata.com`) | `https://in.logs.betterstack.com` |
| `BETTERSTACK_MIN_LEVEL` | Minimum level for BetterStack: `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` | `INFO` |
| `BETTERSTACK_BATCH_SIZE` | Number of logs to batch before sending | `10` |
| `BETTERSTACK_FLUSH_INTERVAL_MS` | Flush interval in milliseconds | `5000` |
| `NODE_ENV` | Environment (`development`, `production`) | `development` |

### Convex Environment

Convex functions use their own lightweight logger that outputs structured JSON directly to `console.*`. The Convex dashboard captures these logs automatically.

No additional environment variables are required for Convex logging.

---

## Usage in Next.js

### Option 1: `withObservability` Wrapper (Recommended)

Automatically handles context setup, auth enrichment, timing, and error logging:

```typescript
import { withObservability, getLogger, extendContext } from '@/lib/observability';
import { NextRequest, NextResponse } from 'next/server';

export const GET = withObservability(
  async (request: NextRequest, routeContext) => {
    const log = getLogger();
    
    // Context is already set up with:
    // - requestId
    // - pathname
    // - method
    // - userEmail (if authenticated)
    
    log.info('Fetching data');
    
    const data = await fetchData();
    extendContext({ recordCount: data.length });
    
    log.info('Data fetched successfully');
    
    return NextResponse.json(data);
  },
  { route: 'myApi.list' }
);
```

### Option 2: Manual Context Setup

For more control or non-API contexts:

```typescript
import { 
  runWithContext, 
  createRequestContext, 
  getLogger, 
  extendContext 
} from '@/lib/observability';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext({
    pathname: request.nextUrl.pathname,
    method: 'GET',
    route: 'myApi.list',
  });

  return runWithContext(ctx, async () => {
    const log = getLogger();
    
    log.info('Processing request');
    // ... your code
    
    return NextResponse.json({ success: true });
  });
}
```

### Option 3: `withContext` for Server-Side Operations

For non-API server code (Server Actions, background jobs):

```typescript
import { withContext, getLogger } from '@/lib/observability';

async function processJob() {
  return withContext('backgroundJob.process', async () => {
    const log = getLogger();
    
    log.info('Starting background job');
    // ... your code
    log.info('Job complete');
  });
}
```

---

## Usage in Convex

Convex functions use a separate, lightweight logger designed for serverless:

```typescript
import { 
  createQueryLogger, 
  createMutationLogger, 
  createActionLogger 
} from './lib/logger';

// For queries
export const getItems = query({
  handler: async (ctx, args) => {
    const log = createQueryLogger('items.getItems', { teamId: args.teamId });
    
    log.debug('Fetching items');
    const items = await ctx.db.query('items').collect();
    log.info('Items fetched', { count: items.length });
    
    return items;
  },
});

// For mutations
export const createItem = mutation({
  handler: async (ctx, args) => {
    const log = createMutationLogger('items.createItem', { 
      teamId: args.teamId,
      userEmail: args.userEmail,
    });
    
    log.info('Creating item');
    const id = await ctx.db.insert('items', args.data);
    log.info('Item created', { itemId: id });
    
    return id;
  },
});

// For actions (external calls, side effects)
export const syncWithExternal = internalAction({
  handler: async (ctx) => {
    const log = createActionLogger('items.syncWithExternal');
    
    log.info('Starting sync');
    // ... external API calls
    log.info('Sync complete');
  },
});
```

### Child Loggers

Create child loggers with additional context:

```typescript
const log = createMutationLogger('orders.process', { orderId });

// For a specific sub-operation
const itemLog = log.child({ itemId: item.id });
itemLog.info('Processing item');
```

---

## Log Levels

| Level | Value | When to Use |
|-------|-------|-------------|
| `DEBUG` | 0 | Detailed debugging info (hidden in production by default) |
| `INFO` | 1 | Normal operations, business events |
| `WARN` | 2 | Something unexpected but recoverable |
| `ERROR` | 3 | Errors that need attention |
| `FATAL` | 4 | Critical errors (app may crash) |

### Examples

```typescript
log.debug('Cache hit', { key: 'user:123' });           // Detailed debugging
log.info('Order placed', { orderId, total });          // Business event
log.warn('Rate limit approaching', { remaining: 10 }); // Needs monitoring
log.error('Payment failed', paymentError);             // Needs investigation
log.fatal('Database connection lost');                 // Critical failure
```

---

## Log Context & Tags

### Automatic Context (Next.js)

When using `withObservability`, these are automatically included:

| Field | Description |
|-------|-------------|
| `requestId` | Unique ID for the request (e.g., `req-m5abc12-x7y8z9`) |
| `pathname` | Request URL path |
| `method` | HTTP method (GET, POST, etc.) |
| `route` | Route identifier you provide |
| `userEmail` | Authenticated user's email (if available) |

### Automatic Context (Convex)

When using Convex loggers, these are included:

| Field | Description |
|-------|-------------|
| `requestId` | Unique ID for the function call (e.g., `cvx-m5abc12-x7y8z9`) |
| `functionName` | Full function name (e.g., `reminders.checkAndSendReminders`) |
| `functionType` | Type: `query`, `mutation`, or `action` |
| `runtime` | Always `convex` |
| `service` | Always `smovr-dash` |

### Adding Custom Context

```typescript
// Next.js - extend the current context
extendContext({ 
  teamId: user.teamId,
  appointmentId: appointment.id,
});

// Convex - pass in initial context
const log = createMutationLogger('orders.create', {
  teamId: args.teamId,
  customerId: args.customerId,
});
```

---

## Sinks

Sinks are log destinations. The system supports multiple sinks simultaneously.

### ConsoleSink (Default)

Human-readable output for development:

```
[2026-01-18T12:30:45.123Z] INFO [req-abc123] Processing order
  userEmail: user@example.com
  orderId: ord_456
```

Configuration:
```typescript
new ConsoleSink({
  minLevel: LogLevel.DEBUG,
  colors: true,        // ANSI colors (auto-disabled in production)
  timestamps: true,    // Include timestamps
  stackTraces: true,   // Include stack traces for errors
});
```

### JsonSink

Structured JSON for log aggregation:

```json
{"dt":"2026-01-18T12:30:45.123Z","level":"info","message":"Processing order","requestId":"req-abc123","userEmail":"user@example.com","orderId":"ord_456"}
```

### ExternalSink

Buffered HTTP sink for external services:

```typescript
new ExternalSink({
  name: 'betterstack',
  endpoint: 'https://in.logs.betterstack.com',
  apiKey: 'your-token',
  authHeader: 'Authorization',
  minLevel: LogLevel.INFO,
  batchSize: 10,
  flushIntervalMs: 5000,
  consoleFallback: true,  // Also log to console as backup
  transform: (entry) => ({ /* your format */ }),
});
```

---

## BetterStack Integration

### Automatic Setup

Set the environment variable and BetterStack is auto-configured:

```bash
BETTERSTACK_SOURCE_TOKEN=your-source-token
```

### Manual Setup

```typescript
import { configureBetterStack, LogLevel } from '@/lib/observability';

configureBetterStack({
  sourceToken: process.env.BETTERSTACK_SOURCE_TOKEN!,
  minLevel: LogLevel.INFO,
  batchSize: 10,
  flushIntervalMs: 5000,
});
```

### Log Format

Logs sent to BetterStack include:

```json
{
  "dt": "2026-01-18T12:30:45.123Z",
  "level": "info",
  "message": "Order created",
  "service": "smovr-dash",
  "env": "production",
  "requestId": "req-abc123",
  "userEmail": "user@example.com",
  "orderId": "ord_456"
}
```

---

## Design Decisions

### 1. Two Separate Loggers (Next.js vs Convex)

**Why?** Convex runs in a unique serverless environment:
- No `AsyncLocalStorage` support (different runtime)
- No process lifecycle hooks
- Console output is the only way to emit logs

**Solution:** A lightweight, synchronous Convex logger (`convex/lib/logger.ts`) that outputs JSON to console, while the Next.js logger uses full `AsyncLocalStorage` context propagation.

### 2. Console as Primary Sink

**Why?** In serverless environments:
- HTTP sinks may not complete before the function terminates
- Process exit handlers don't run
- `waitUntil()` isn't available everywhere

**Solution:** Console sink is always active and writes immediately. External sinks (BetterStack) are secondary with console fallback.

### 3. Request ID Generation

**Why?** Correlate all logs from a single request/function call.

**Format:**
- Next.js: `req-{timestamp36}-{random}` (e.g., `req-m5abc12-x7y8z9`)
- Convex: `cvx-{timestamp36}-{random}` (e.g., `cvx-m5abc12-x7y8z9`)

### 4. Context Extension (Not Replacement)

**Why?** As a request progresses, you learn more context (user ID after auth, record IDs after DB queries).

**Solution:** `extendContext()` merges new tags without losing existing ones.

### 5. Structured JSON Logs

**Why?** 
- Machine-parseable for log aggregation
- Consistent format across services
- Easy to search and filter in tools like BetterStack

### 6. Log Level Filtering at Sink Level

**Why?** Different sinks may need different verbosity:
- Console: DEBUG (see everything in dev)
- BetterStack: INFO (avoid noise/cost in production)

---

## Troubleshooting

### Logs not appearing in BetterStack

1. Check `BETTERSTACK_SOURCE_TOKEN` is set correctly
2. Verify logs appear in console (the sink always logs to console first)
3. Check `BETTERSTACK_MIN_LEVEL` isn't filtering your logs
4. Wait for batch to fill or flush interval to elapse

### Context not propagating in Next.js

Ensure you're inside a `runWithContext` or `withObservability` wrapper:

```typescript
// ❌ Wrong - no context
export async function GET() {
  const log = getLogger(); // Returns global logger with no request context
}

// ✅ Correct
export const GET = withObservability(async () => {
  const log = getLogger(); // Returns logger with request context
}, { route: 'api.get' });
```

### Convex logs not structured

Ensure you're using the logger from `convex/lib/logger.ts`:

```typescript
// ❌ Wrong
console.log('Processing');

// ✅ Correct
import { createMutationLogger } from './lib/logger';
const log = createMutationLogger('module.function');
log.info('Processing');
```

### requestId missing

For Next.js, ensure you're using `withObservability` or `createRequestContext`.

For Convex, the `requestId` is auto-generated when you create a logger:

```typescript
const log = createMutationLogger('module.function');
// requestId is automatically generated and included in all logs
```

---

## File Structure

```
src/lib/observability/
├── README.md           # This file
├── index.ts            # Main entry point, exports, auto-configuration
├── types.ts            # LogLevel, LogEntry, LogContext types
├── logger.ts           # Logger class
├── sinks.ts            # LogSink interface, SinkRegistry
├── sinks/
│   ├── index.ts        # Re-exports all sinks
│   ├── console-sink.ts # Human-readable console output
│   ├── json-sink.ts    # Structured JSON output
│   └── external-sink.ts # Buffered HTTP sink
├── context.ts          # AsyncLocalStorage context management
└── api-wrapper.ts      # withObservability HOC for API routes

convex/lib/
└── logger.ts           # Convex-specific lightweight logger
```

---

## Related Documentation

- [BetterStack Logs Documentation](https://betterstack.com/docs/logs/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Convex Functions](https://docs.convex.dev/functions)
- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage)

