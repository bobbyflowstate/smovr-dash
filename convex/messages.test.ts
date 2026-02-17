import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

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

/** Seed a team + user with conversations at known times. */
async function seedUserWithConversations(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", { name: "Acme Dental" });
    await ctx.db.insert("users", {
      name: "Dr. Smith",
      email: "smith@acme.test",
      tokenIdentifier: "tok-smith",
      teamId,
    });

    const p1 = await ctx.db.insert("patients", { phone: "+15550000001", name: "P1", teamId });
    const p2 = await ctx.db.insert("patients", { phone: "+15550000002", name: "P2", teamId });
    const p3 = await ctx.db.insert("patients", { phone: "+15550000003", name: "P3", teamId });

    await ctx.db.insert("conversations", {
      teamId,
      patientId: p1,
      patientPhone: "+15550000001",
      patientName: "P1",
      lastMessageBody: "old",
      lastMessageDirection: "inbound",
      lastMessageAt: "2026-01-01T10:00:00.000Z",
      unreadCount: 0,
    });
    await ctx.db.insert("conversations", {
      teamId,
      patientId: p2,
      patientPhone: "+15550000002",
      patientName: "P2",
      lastMessageBody: "middle",
      lastMessageDirection: "inbound",
      lastMessageAt: "2026-01-01T11:00:00.000Z",
      unreadCount: 1,
    });
    await ctx.db.insert("conversations", {
      teamId,
      patientId: p3,
      patientPhone: "+15550000003",
      patientName: "P3",
      lastMessageBody: "new",
      lastMessageDirection: "outbound",
      lastMessageAt: "2026-01-01T12:00:00.000Z",
      unreadCount: 2,
    });

    return { teamId, patientIds: [p1, p2, p3] };
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

describe("messages list queries", () => {
  it("getConversations returns newest first and supports beforeLastMessageAt pagination", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithConversations(t);

    const firstPage = await t.query(api.messages.getConversations, {
      userEmail: "smith@acme.test",
      limit: 2,
    });
    expect(firstPage).toHaveLength(2);
    expect(firstPage[0].lastMessageAt).toBe("2026-01-01T12:00:00.000Z");
    expect(firstPage[1].lastMessageAt).toBe("2026-01-01T11:00:00.000Z");

    const secondPage = await t.query(api.messages.getConversations, {
      userEmail: "smith@acme.test",
      limit: 2,
      beforeLastMessageAt: firstPage[firstPage.length - 1].lastMessageAt,
    });
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].lastMessageAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("getMessagesForPatient returns newest first and paginates by _creationTime cursor", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const teamId = await ctx.db.insert("teams", { name: "Acme Dental" });
      await ctx.db.insert("users", {
        name: "Dr. Smith",
        email: "smith@acme.test",
        tokenIdentifier: "tok-smith",
        teamId,
      });
      const patientId = await ctx.db.insert("patients", {
        phone: "+15559998888",
        name: "Alice",
        teamId,
      });

      await ctx.db.insert("messages", {
        teamId,
        patientId,
        direction: "inbound",
        body: "m1",
        phone: "+15559998888",
        status: "received",
        createdAt: "2026-01-01T10:00:00.000Z",
      });
      await ctx.db.insert("messages", {
        teamId,
        patientId,
        direction: "inbound",
        body: "m2",
        phone: "+15559998888",
        status: "received",
        createdAt: "2026-01-01T10:01:00.000Z",
      });
      await ctx.db.insert("messages", {
        teamId,
        patientId,
        direction: "inbound",
        body: "m3",
        phone: "+15559998888",
        status: "received",
        createdAt: "2026-01-01T10:02:00.000Z",
      });

      return { patientId };
    });

    const firstPage = await t.query(api.messages.getMessagesForPatient, {
      userEmail: "smith@acme.test",
      patientId: seeded.patientId,
      limit: 2,
    });
    expect(firstPage).toHaveLength(2);
    expect(firstPage[0].body).toBe("m3");
    expect(firstPage[1].body).toBe("m2");

    const secondPage = await t.query(api.messages.getMessagesForPatient, {
      userEmail: "smith@acme.test",
      patientId: seeded.patientId,
      limit: 2,
      beforeMessageCreatedAt: firstPage[firstPage.length - 1]._creationTime,
    });
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].body).toBe("m1");
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
