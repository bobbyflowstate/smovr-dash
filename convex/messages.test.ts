import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { Id } from "./_generated/dataModel";

/** Seed a team + patient (with phone). Returns IDs. */
async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", { name: "Acme Dental" });
    const patientId = await ctx.db.insert("patients", {
      phone: "+15551234567",
      name: "Alice Jones",
      teamId,
    });
    return { teamId, patientId };
  });
}

/** Seed team + patient + a pending outbound message. */
async function seedWithMessage(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", { name: "Acme Dental" });
    const patientId = await ctx.db.insert("patients", {
      phone: "+15551234567",
      name: "Alice Jones",
      teamId,
    });
    const messageId = await ctx.db.insert("messages", {
      teamId,
      patientId,
      direction: "outbound" as const,
      body: "Your appointment is tomorrow.",
      phone: "+15551234567",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    });
    return { teamId, patientId, messageId };
  });
}

// ─── createInboundMessage ─────────────────────────────────────────────────────

describe("messages.createInboundMessage", () => {
  it("creates an inbound message and a conversation with unreadCount=1", async () => {
    const t = convexTest(schema, modules);
    const { teamId, patientId } = await seed(t);

    const result = await t.mutation(internal.messages.createInboundMessage, {
      teamId,
      phone: "+15551234567",
      body: "Hi, I need to reschedule.",
      providerMessageId: "twilio-sid-123",
    });

    expect(result).not.toBeNull();
    expect(result!.patientId).toBe(patientId);

    // Verify the message was stored
    const msg = await t.run(async (ctx) => ctx.db.get(result!.messageId));
    expect(msg).toMatchObject({
      direction: "inbound",
      status: "received",
      body: "Hi, I need to reschedule.",
      providerMessageId: "twilio-sid-123",
    });

    // Verify conversation was created with unreadCount
    const conv = await t.run(async (ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("by_team_patient", (q: any) =>
          q.eq("teamId", teamId).eq("patientId", patientId),
        )
        .first(),
    );
    expect(conv).not.toBeNull();
    expect(conv!.unreadCount).toBe(1);
    expect(conv!.lastMessageDirection).toBe("inbound");
  });

  it("returns null when no patient matches the phone number", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seed(t);

    const result = await t.mutation(internal.messages.createInboundMessage, {
      teamId,
      phone: "+19999999999",
      body: "Wrong number",
    });

    expect(result).toBeNull();
  });

  it("increments unreadCount on an existing conversation", async () => {
    const t = convexTest(schema, modules);
    const { teamId, patientId } = await seed(t);

    // First inbound message — creates conversation
    await t.mutation(internal.messages.createInboundMessage, {
      teamId,
      phone: "+15551234567",
      body: "Message 1",
    });

    // Second inbound message — should increment
    await t.mutation(internal.messages.createInboundMessage, {
      teamId,
      phone: "+15551234567",
      body: "Message 2",
    });

    const conv = await t.run(async (ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("by_team_patient", (q: any) =>
          q.eq("teamId", teamId).eq("patientId", patientId),
        )
        .first(),
    );
    expect(conv!.unreadCount).toBe(2);
    expect(conv!.lastMessageBody).toBe("Message 2");
  });
});

// ─── updateMessageStatus ──────────────────────────────────────────────────────

describe("messages.updateMessageStatus", () => {
  it("sets status to 'sent' and populates sentAt", async () => {
    const t = convexTest(schema, modules);
    const { messageId } = await seedWithMessage(t);

    await t.mutation(internal.messages.updateMessageStatus, {
      messageId,
      status: "sent",
      providerMessageId: "twilio-sid-abc",
    });

    const msg = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(msg!.status).toBe("sent");
    expect(msg!.sentAt).toBeDefined();
    expect(msg!.providerMessageId).toBe("twilio-sid-abc");
  });

  it("sets status to 'delivered' and populates deliveredAt", async () => {
    const t = convexTest(schema, modules);
    const { messageId } = await seedWithMessage(t);

    await t.mutation(internal.messages.updateMessageStatus, {
      messageId,
      status: "delivered",
    });

    const msg = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(msg!.status).toBe("delivered");
    expect(msg!.sentAt).toBeDefined();
    expect(msg!.deliveredAt).toBeDefined();
  });

  it("sets status to 'failed' and stores errorMessage", async () => {
    const t = convexTest(schema, modules);
    const { messageId } = await seedWithMessage(t);

    await t.mutation(internal.messages.updateMessageStatus, {
      messageId,
      status: "failed",
      errorMessage: "Provider unreachable",
    });

    const msg = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(msg!.status).toBe("failed");
    expect(msg!.errorMessage).toBe("Provider unreachable");
    expect(msg!.sentAt).toBeUndefined();
  });
});

// ─── createSystemMessageInternal ──────────────────────────────────────────────

describe("messages.createSystemMessageInternal", () => {
  it("creates an outbound system message and updates conversation", async () => {
    const t = convexTest(schema, modules);
    const { teamId, patientId } = await seed(t);

    const result = await t.mutation(internal.messages.createSystemMessageInternal, {
      teamId,
      patientId,
      phone: "+15551234567",
      body: "Your appointment is confirmed for tomorrow at 2 PM.",
      messageType: "booking_confirmation",
      status: "sent",
      providerMessageId: "ghl-12345",
    });

    expect(result.messageId).toBeDefined();

    const msg = await t.run(async (ctx) => ctx.db.get(result.messageId));
    expect(msg).toMatchObject({
      direction: "outbound",
      status: "sent",
      body: "Your appointment is confirmed for tomorrow at 2 PM.",
    });
    expect(msg!.sentAt).toBeDefined();

    // Conversation should be updated
    const conv = await t.run(async (ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("by_team_patient", (q: any) =>
          q.eq("teamId", teamId).eq("patientId", patientId),
        )
        .first(),
    );
    expect(conv).not.toBeNull();
    expect(conv!.lastMessageDirection).toBe("outbound");
  });

  it("does not update conversation when status is 'failed'", async () => {
    const t = convexTest(schema, modules);
    const { teamId, patientId } = await seed(t);

    await t.mutation(internal.messages.createSystemMessageInternal, {
      teamId,
      patientId,
      phone: "+15551234567",
      body: "Failed delivery attempt.",
      messageType: "reminder_24h",
      status: "failed",
      errorMessage: "Timeout",
    });

    // No conversation should exist since the message failed
    const conv = await t.run(async (ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("by_team_patient", (q: any) =>
          q.eq("teamId", teamId).eq("patientId", patientId),
        )
        .first(),
    );
    expect(conv).toBeNull();
  });
});
