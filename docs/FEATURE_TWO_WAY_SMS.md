# Feature Spec: Two-Way SMS Messaging

## Overview

Add two-way SMS messaging to the dashboard, allowing staff to view patient replies and send messages directly from the UI. The implementation abstracts the SMS provider to allow easy switching from GoHighLevel to Twilio or others.

## Requirements

| Requirement | Details |
|-------------|---------|
| **Provider Abstraction** | SMS provider is pluggable; not tied to GoHighLevel |
| **Per-Tenant SMS** | Each team has their own SMS configuration (API keys, phone number) |
| **Staff Attribution** | Track which staff member sent each outbound message |
| **Message Templates** | Pre-defined quick replies for common responses |
| **Real-time Updates** | New messages appear instantly via Convex subscriptions |

---

## Architecture

### SMS Provider Abstraction

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  (Convex functions, Next.js API routes, Dashboard UI)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SMS Service Interface                    │
│  sendMessage(phone, body, teamId) → Promise<SendResult>     │
│  parseInboundWebhook(request) → InboundMessage              │
│  getDeliveryStatus(messageId) → DeliveryStatus              │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐
        │  GHL     │   │  Twilio  │
        │ Adapter  │   │ Adapter  │
        └──────────┘   └──────────┘
```

### Provider Configuration (Per-Team)

```typescript
// Each team stores their SMS provider config
// Secrets are encrypted or stored in env vars keyed by teamId

interface TeamSMSConfig {
  provider: "ghl" | "twilio" | "mock";
  // Provider-specific fields (stored encrypted or as env var references)
  webhookUrl?: string;      // GHL
  accountSid?: string;      // Twilio
  authToken?: string;       // Twilio
  fromNumber?: string;      // Twilio
}
```

---

## Data Model

### New Tables

```typescript
// convex/schema.ts

// SMS Messages (conversation history)
messages: defineTable({
  teamId: v.id("teams"),
  patientId: v.id("patients"),
  appointmentId: v.optional(v.id("appointments")),
  
  // Message content
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  body: v.string(),
  phone: v.string(),
  
  // Status tracking
  status: v.union(
    v.literal("pending"),      // queued to send
    v.literal("sent"),         // accepted by provider
    v.literal("delivered"),    // confirmed delivered
    v.literal("failed"),       // send failed
    v.literal("received")      // inbound message
  ),
  
  // Timestamps
  createdAt: v.string(),       // when record created
  sentAt: v.optional(v.string()),
  deliveredAt: v.optional(v.string()),
  
  // Attribution (outbound only)
  sentByUserId: v.optional(v.id("users")),
  sentByEmail: v.optional(v.string()),
  
  // Provider metadata
  providerMessageId: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  
  // Template reference (if sent from template)
  templateId: v.optional(v.id("messageTemplates")),
})
  .index("by_team", ["teamId"])
  .index("by_patient", ["patientId"])
  .index("by_team_patient", ["teamId", "patientId"])
  .index("by_team_createdAt", ["teamId", "createdAt"]),

// Conversation summaries (for list view performance)
conversations: defineTable({
  teamId: v.id("teams"),
  patientId: v.id("patients"),
  patientPhone: v.string(),
  patientName: v.optional(v.string()),
  
  // Last message preview
  lastMessageBody: v.string(),
  lastMessageDirection: v.union(v.literal("inbound"), v.literal("outbound")),
  lastMessageAt: v.string(),
  
  // Unread tracking
  unreadCount: v.number(),
  
  // Link to appointment (if any)
  latestAppointmentId: v.optional(v.id("appointments")),
})
  .index("by_team", ["teamId"])
  .index("by_team_lastMessage", ["teamId", "lastMessageAt"])
  .index("by_team_patient", ["teamId", "patientId"]),

// Message templates (quick replies)
messageTemplates: defineTable({
  teamId: v.id("teams"),
  name: v.string(),           // "Running Late"
  body: v.string(),           // "No problem! We'll see you when you arrive."
  category: v.optional(v.string()), // "Scheduling", "General", etc.
  sortOrder: v.number(),
  isActive: v.boolean(),
  
  // Placeholders supported: {{patientName}}, {{appointmentDate}}, {{appointmentTime}}
  // Resolved at send time
})
  .index("by_team", ["teamId"])
  .index("by_team_active", ["teamId", "isActive"]),

// Team SMS configuration
// Note: Sensitive credentials should use env vars, not stored directly
teamSmsConfig: defineTable({
  teamId: v.id("teams"),
  provider: v.union(
    v.literal("ghl"),
    v.literal("twilio"),
    v.literal("mock")
  ),
  isEnabled: v.boolean(),
  fromNumber: v.optional(v.string()),
  
  // For webhook-based providers (GHL)
  webhookUrl: v.optional(v.string()),
  
  // For API-based providers, store env var names (not actual secrets)
  // e.g., "TEAM_123_TWILIO_ACCOUNT_SID" → look up at runtime
  credentialsEnvPrefix: v.optional(v.string()),
})
  .index("by_team", ["teamId"]),
```

### Schema Updates to Existing Tables

```typescript
// teams table - add SMS-related fields
teams: defineTable({
  // ... existing fields ...
  
  // SMS settings (optional, can also use teamSmsConfig table)
  smsEnabled: v.optional(v.boolean()),
  smsFromNumber: v.optional(v.string()),
}),
```

---

## SMS Provider Interface

### Core Interface

```typescript
// src/lib/sms/types.ts

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attemptCount: number;
}

export interface InboundMessage {
  phone: string;
  body: string;
  receivedAt: string;
  providerMessageId?: string;
  rawPayload?: Record<string, unknown>;
}

export interface SMSProvider {
  name: string;
  
  sendMessage(params: {
    to: string;
    body: string;
    from?: string;
  }): Promise<SendResult>;
  
  parseInboundWebhook(request: Request): Promise<InboundMessage | null>;
  
  // Optional: verify webhook signature
  verifyWebhookSignature?(request: Request): Promise<boolean>;
}
```

### Provider Implementations

```typescript
// src/lib/sms/providers/ghl.ts
export class GHLProvider implements SMSProvider {
  name = "ghl";
  
  constructor(private webhookUrl: string) {}
  
  async sendMessage({ to, body }) {
    // POST to GHL webhook with { phone, message }
  }
  
  async parseInboundWebhook(request) {
    // Parse GHL inbound format
  }
}

// src/lib/sms/providers/twilio.ts
export class TwilioProvider implements SMSProvider {
  name = "twilio";
  
  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string
  ) {}
  
  async sendMessage({ to, body }) {
    // Use Twilio REST API
  }
  
  async parseInboundWebhook(request) {
    // Parse Twilio webhook format
  }
  
  async verifyWebhookSignature(request) {
    // Validate X-Twilio-Signature
  }
}

// src/lib/sms/providers/mock.ts
export class MockProvider implements SMSProvider {
  name = "mock";
  
  async sendMessage({ to, body }) {
    console.log(`[mock-sms] To: ${to}, Body: ${body}`);
    return { success: true, messageId: `mock-${Date.now()}`, attemptCount: 1 };
  }
  
  async parseInboundWebhook(request) {
    const body = await request.json();
    return { phone: body.phone, body: body.message, receivedAt: new Date().toISOString() };
  }
}
```

### Provider Factory

```typescript
// src/lib/sms/index.ts

export async function getSMSProvider(teamId: string): Promise<SMSProvider> {
  // 1. Look up team SMS config from Convex
  // 2. Load credentials from env vars using team's prefix
  // 3. Return appropriate provider instance
  
  const config = await getTeamSMSConfig(teamId);
  
  switch (config.provider) {
    case "ghl":
      return new GHLProvider(config.webhookUrl!);
    case "twilio":
      return new TwilioProvider(
        process.env[`${config.credentialsEnvPrefix}_ACCOUNT_SID`]!,
        process.env[`${config.credentialsEnvPrefix}_AUTH_TOKEN`]!,
        config.fromNumber!
      );
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`Unknown SMS provider: ${config.provider}`);
  }
}
```

---

## API Routes

### Send Message

```typescript
// POST /api/messages/send
// Body: { patientId, body, templateId? }

// 1. Auth check
// 2. Get patient and team info
// 3. Create message record (status: pending)
// 4. Get SMS provider for team
// 5. Send via provider
// 6. Update message status (sent/failed)
// 7. Update conversation record
// 8. Return message
```

### Inbound Webhook (Provider-Specific Routes)

```typescript
// POST /api/webhooks/sms/ghl
// POST /api/webhooks/sms/twilio
// Each route:
// 1. Verify signature (if supported)
// 2. Parse inbound message using provider
// 3. Look up patient by phone
// 4. Create message record (direction: inbound)
// 5. Update conversation (increment unreadCount)
// 6. Return 200
```

### Mark Conversation Read

```typescript
// POST /api/conversations/[patientId]/read

// 1. Auth check
// 2. Set unreadCount = 0 for conversation
```

---

## Convex Functions

### Queries

```typescript
// convex/messages.ts

// Get conversations for team (list view)
export const getConversations = query({
  args: { userEmail: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Get user's team
    // Query conversations by team, ordered by lastMessageAt desc
    // Return with unread counts
  },
});

// Get messages for a patient (thread view)
export const getMessagesForPatient = query({
  args: { userEmail: v.string(), patientId: v.id("patients") },
  handler: async (ctx, args) => {
    // Verify user has access to patient's team
    // Query messages by patientId, ordered by createdAt
    // Return messages with sender info
  },
});

// Get message templates for team
export const getTemplates = query({
  args: { userEmail: v.string() },
  handler: async (ctx, args) => {
    // Get user's team
    // Query active templates, ordered by sortOrder
  },
});

// Get unread count for nav badge
export const getUnreadCount = query({
  args: { userEmail: v.string() },
  handler: async (ctx, args) => {
    // Sum unreadCount across all team conversations
  },
});
```

### Mutations

```typescript
// convex/messages.ts

// Record outbound message
export const createOutboundMessage = mutation({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
    body: v.string(),
    templateId: v.optional(v.id("messageTemplates")),
  },
  handler: async (ctx, args) => {
    // Create message with status: pending
    // Return message ID for status updates
  },
});

// Update message status (called after send attempt)
export const updateMessageStatus = mutation({
  args: {
    messageId: v.id("messages"),
    status: v.union(v.literal("sent"), v.literal("delivered"), v.literal("failed")),
    providerMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Patch message record
    // Update conversation lastMessage if needed
  },
});

// Record inbound message (called from webhook)
export const createInboundMessage = mutation({
  args: {
    teamId: v.id("teams"),
    patientId: v.id("patients"),
    phone: v.string(),
    body: v.string(),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Create message with direction: inbound, status: received
    // Upsert conversation, increment unreadCount
  },
});

// Mark conversation as read
export const markConversationRead = mutation({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    // Verify access
    // Set unreadCount = 0
  },
});
```

---

## Dashboard UI

### Navigation

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  Appointments  Submit  Messages (3)  Audit Logs │
└─────────────────────────────────────────────────────────┘
                                    ▲
                              Unread badge
```

### Conversations List (`/messages`)

```
┌─────────────────────────────────────────────────────────────┐
│  Messages                                    🔍 Search      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● John Smith              +1 (555) 123-4567   2m ago│   │
│  │   "Yes, I can make it tomorrow"                     │   │
│  │   📅 Appt: Jan 28 @ 2:30 PM                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │   Jane Doe                +1 (555) 987-6543   1h ago│   │
│  │   You: "See you then!"                              │   │
│  │   📅 Appt: Jan 29 @ 10:00 AM                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │   Bob Wilson              +1 (555) 456-7890   1d ago│   │
│  │   You: "Your appointment is confirmed."             │   │
│  │   📅 Appt: Jan 30 @ 3:00 PM                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

● = unread indicator
```

### Conversation Detail (`/messages/[patientId]`)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back    John Smith    +1 (555) 123-4567                  │
│            📅 Upcoming: Jan 28, 2026 @ 2:30 PM              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │ Hi John, your appointment is     │              10:15 AM │
│  │ confirmed for Jan 28 at 2:30 PM. │              ✓ Sent   │
│  │ [View full message]              │         via Template  │
│  └──────────────────────────────────┘                       │
│                                                             │
│                      ┌──────────────────────────────────┐   │
│             10:22 AM │ Thanks! Can I bring my           │   │
│                      │ daughter too?                    │   │
│                      └──────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │ Of course! Just let the front    │              10:25 AM │
│  │ desk know when you arrive.       │              ✓ Sent   │
│  └──────────────────────────────────┘         by Sarah M.   │
│                                                             │
│                      ┌──────────────────────────────────┐   │
│             10:30 AM │ Perfect, see you then!           │   │
│                      └──────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Quick Replies:                                             │
│  [Running Late] [Need to Reschedule] [Confirm Attendance]   │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐      │
│  │ Type a message...                                 │ Send │
│  └───────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Template Management (`/settings/templates`)

```
┌─────────────────────────────────────────────────────────────┐
│  Message Templates                          [+ New Template]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Running Late                              [Edit] [🗑]│   │
│  │ "No problem! We'll see you when you arrive."        │   │
│  │ Category: Scheduling                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Confirm Attendance                        [Edit] [🗑]│   │
│  │ "Hi {{patientName}}, please reply YES to confirm    │   │
│  │  your appointment on {{appointmentDate}}."          │   │
│  │ Category: Reminders                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Supported placeholders:                                    │
│  {{patientName}}, {{appointmentDate}}, {{appointmentTime}}  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Migration Path

### Migrate Existing Outbound SMS

After implementing, backfill `messages` table from existing `reminder_attempts` / audit logs so historical outbound messages appear in conversations.

### Gradual Provider Rollout

1. Start with `mock` provider for testing
2. Migrate existing GHL webhook to new abstraction
3. Add Twilio adapter when ready to switch

---

## Implementation Phases

### Phase 1: Foundation (2-3 days)
- [ ] Add schema tables (`messages`, `conversations`, `messageTemplates`, `teamSmsConfig`)
- [ ] Create SMS provider interface and adapters (mock, GHL)
- [ ] Implement Convex mutations for message creation
- [ ] Add inbound webhook route

### Phase 2: Core UI (2-3 days)
- [ ] Conversations list page
- [ ] Conversation detail / thread view
- [ ] Message input with send functionality
- [ ] Real-time updates via Convex subscriptions

### Phase 3: Templates & Attribution (1-2 days)
- [ ] Template CRUD (Convex functions + UI)
- [ ] Quick reply buttons in conversation view
- [ ] Staff attribution on outbound messages
- [ ] Template placeholder resolution

### Phase 4: Polish & Production (1-2 days)
- [ ] Unread badge in nav
- [ ] Mark-as-read on view
- [ ] Search/filter conversations
- [ ] Error handling & retry UI
- [ ] Twilio adapter (if switching)

---

## Security Considerations

| Area | Approach |
|------|----------|
| **Credential Storage** | Store env var *names* in DB, actual secrets in env vars |
| **Webhook Auth** | Verify signatures (Twilio), use secret URL tokens (GHL) |
| **Team Isolation** | All queries filter by teamId from authenticated user |
| **Rate Limiting** | Consider per-team send limits to prevent abuse |
| **Opt-out** | Store opt-out status on patient, block sends |
| **Audit Trail** | All sends logged with user attribution |

---

## Open Questions

1. **Phone number format**: Normalize all to E.164 on ingest?
2. **Unknown senders**: Create patient record on inbound from unknown number, or queue for manual review?
3. **MMS support**: Images/media? (adds complexity)
4. **Scheduled messages**: Send later feature?

---

## Related Docs

- [WEBHOOK_SETUP.md](./WEBHOOK_SETUP.md) - Current outbound webhook docs
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [TASK_4_MULTI_TENANCY.md](./TASK_4_MULTI_TENANCY.md) - Multi-tenant patterns

