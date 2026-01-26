# Convex Library

Shared utilities for Convex backend functions.

## Logger (`logger.ts`)

A lightweight, synchronous logger designed for Convex's serverless environment.

### Why a Separate Logger?

Convex runs in a unique serverless environment where:
- Each function invocation is isolated
- No `AsyncLocalStorage` (different runtime from Node.js)
- Console output is the only way to emit logs
- No process lifecycle hooks or shutdown handlers

This logger writes structured JSON directly to `console.*`, which Convex captures and displays in the dashboard.

### Quick Start

```typescript
import { createMutationLogger, createQueryLogger, createActionLogger } from './lib/logger';

// For mutations
export const createItem = mutation({
  handler: async (ctx, args) => {
    const log = createMutationLogger('items.createItem', {
      teamId: args.teamId,
    });
    
    log.info('Creating item');
    const id = await ctx.db.insert('items', args.data);
    log.info('Item created', { itemId: id });
    
    return id;
  },
});

// For queries
export const getItems = query({
  handler: async (ctx, args) => {
    const log = createQueryLogger('items.getItems');
    
    log.debug('Fetching items');
    const items = await ctx.db.query('items').collect();
    log.info('Fetched items', { count: items.length });
    
    return items;
  },
});

// For actions
export const syncExternal = internalAction({
  handler: async (ctx) => {
    const log = createActionLogger('sync.external');
    
    log.info('Starting sync');
    // ... your code
    log.info('Sync complete');
  },
});
```

### Log Output

Logs are JSON objects written to console:

```json
{
  "dt": "2026-01-18T18:50:00.018Z",
  "level": "info",
  "message": "Creating item",
  "service": "smovr-dash",
  "runtime": "convex",
  "requestId": "cvx-m5abc12-x7y8z9",
  "functionName": "items.createItem",
  "functionType": "mutation",
  "teamId": "team_123"
}
```

### Request ID

Each logger instance generates a unique `requestId` that correlates all logs from a single function invocation:

- Format: `cvx-{timestamp36}-{random}`
- Example: `cvx-m5abc12-x7y8z9`

Child loggers inherit the parent's `requestId`:

```typescript
const log = createMutationLogger('orders.process', { orderId });
const itemLog = log.child({ itemId: item.id });
// itemLog has the same requestId as log
```

### Log Levels

| Level | Method | Console Output |
|-------|--------|----------------|
| debug | `log.debug()` | `console.log` |
| info | `log.info()` | `console.log` |
| warn | `log.warn()` | `console.warn` |
| error | `log.error()` | `console.error` |

### Error Logging

The `error` method accepts an optional error object:

```typescript
try {
  await riskyOperation();
} catch (error) {
  log.error('Operation failed', error, { context: 'additional info' });
}
```

This produces:

```json
{
  "level": "error",
  "message": "Operation failed",
  "error_name": "TypeError",
  "error_message": "Cannot read property 'x' of undefined",
  "error_stack": "TypeError: Cannot read...",
  "context": "additional info"
}
```

### API Reference

#### `createConvexLogger(context, options?)`

Creates a logger with full control over context.

```typescript
const log = createConvexLogger({
  functionName: 'myModule.myFunction',
  teamId: 'team_123',
  customField: 'value',
}, {
  minLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
});
```

#### `createQueryLogger(functionName, context?)`

Convenience wrapper for query functions.

```typescript
const log = createQueryLogger('items.list', { teamId: 'team_123' });
// Sets functionType: 'query'
```

#### `createMutationLogger(functionName, context?)`

Convenience wrapper for mutation functions.

```typescript
const log = createMutationLogger('items.create', { teamId: 'team_123' });
// Sets functionType: 'mutation'
```

#### `createActionLogger(functionName, context?)`

Convenience wrapper for action functions.

```typescript
const log = createActionLogger('sync.external');
// Sets functionType: 'action'
```

#### `log.child(additionalContext)`

Creates a child logger with additional context. Inherits `requestId` from parent.

```typescript
const log = createMutationLogger('orders.process', { orderId: 'ord_123' });
const itemLog = log.child({ itemId: 'item_456' });
```

---

For the full observability system documentation (including Next.js integration), see:
`src/lib/observability/README.md`

