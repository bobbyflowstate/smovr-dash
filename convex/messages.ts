/**
 * SMS Messages Convex Functions
 * 
 * Handles conversation history for two-way SMS messaging.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { createQueryLogger, createMutationLogger } from "./lib/logger";

function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

// ============================================
// Queries
// ============================================

/**
 * Get all conversations for a team (for list view)
 */
export const getConversations = query({
  args: {
    userEmail: v.string(),
    limit: v.optional(v.number()),
    beforeLastMessageAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("messages.getConversations", { userEmail: args.userEmail });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.warn("User not found or no team");
      return [];
    }
    
    const teamId = user.teamId;
    const limit = Math.max(1, Math.min(args.limit || 50, 200));

    const conversations = args.beforeLastMessageAt
      ? await ctx.db
          .query("conversations")
          .withIndex("by_team_lastMessage", (q) =>
            q.eq("teamId", teamId).lt("lastMessageAt", args.beforeLastMessageAt!)
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("conversations")
          .withIndex("by_team_lastMessage", (q) => q.eq("teamId", teamId))
          .order("desc")
          .take(limit);

    log.debug("Fetched conversations", { count: conversations.length, teamId, limit });
    return conversations;
  },
});

/**
 * Get messages for a patient (thread view)
 */
export const getMessagesForPatient = query({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
    limit: v.optional(v.number()),
    beforeMessageCreatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("messages.getMessagesForPatient", { 
      userEmail: args.userEmail,
      patientId: args.patientId,
    });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.warn("User not found or no team");
      return [];
    }
    
    const teamId = user.teamId;

    // Verify patient belongs to user's team
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.teamId !== teamId) {
      log.warn("Patient not found or not in user's team");
      return [];
    }
    
    const limit = Math.max(1, Math.min(args.limit || 100, 200));

    // Get newest messages first. Use _creationTime cursor for pagination.
    const messages = args.beforeMessageCreatedAt
      ? await ctx.db
          .query("messages")
          .withIndex("by_team_patient", (q) =>
            q
              .eq("teamId", teamId)
              .eq("patientId", args.patientId)
              .lt("_creationTime", args.beforeMessageCreatedAt!)
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("messages")
          .withIndex("by_team_patient", (q) =>
            q.eq("teamId", teamId).eq("patientId", args.patientId)
          )
          .order("desc")
          .take(limit);
    
    // Enrich with sender info for outbound messages
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        let senderName: string | null = null;
        if (msg.direction === "outbound" && msg.sentByUserId) {
          const sender = await ctx.db.get(msg.sentByUserId);
          senderName = sender?.name || msg.sentByEmail || null;
        }
        return {
          ...msg,
          senderName,
        };
      })
    );
    
    log.debug("Fetched messages for patient", {
      count: enriched.length,
      patientId: args.patientId,
      limit,
    });
    return enriched;
  },
});

/**
 * Get total unread count for nav badge
 */
export const getUnreadCount = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("messages.getUnreadCount", { userEmail: args.userEmail });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      return 0;
    }
    
    const teamId = user.teamId;

    // Sum unread counts across all conversations
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    
    const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
    
    log.debug("Calculated unread count", { totalUnread });
    return totalUnread;
  },
});

// ============================================
// Mutations - Outbound Messages
// ============================================

/**
 * Create an outbound message record (before sending)
 */
export const createOutboundMessage = mutation({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
    body: v.string(),
    templateId: v.optional(v.id("messageTemplates")),
    appointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messages.createOutboundMessage", {
      userEmail: args.userEmail,
      patientId: args.patientId,
    });
    
    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.error("User not found or no team");
      throw new Error("User not found");
    }
    
    const teamId = user.teamId;

    // Verify patient belongs to user's team
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.teamId !== teamId) {
      log.error("Patient not found or not in user's team");
      throw new Error("Patient not found");
    }
    
    const now = new Date().toISOString();
    
    // Create message record
    const messageId = await ctx.db.insert("messages", {
      teamId,
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      direction: "outbound",
      body: args.body,
      phone: patient.phone,
      status: "pending",
      createdAt: now,
      sentByUserId: user._id,
      sentByEmail: user.email,
      templateId: args.templateId,
    });
    
    log.info("Created outbound message", { messageId });
    
    return {
      messageId,
      phone: patient.phone,
      teamId,
    };
  },
});

/**
 * Update message status after send attempt.
 * Internal-only: called from the Next.js send API route.
 */
export const updateMessageStatus = internalMutation({
  args: {
    messageId: v.id("messages"),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed")
    ),
    providerMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messages.updateMessageStatus", {
      messageId: args.messageId,
      status: args.status,
    });
    
    const now = new Date().toISOString();
    
    const updates: Record<string, unknown> = {
      status: args.status,
    };
    
    if (args.status === "sent" || args.status === "delivered") {
      updates.sentAt = now;
    }
    if (args.status === "delivered") {
      updates.deliveredAt = now;
    }
    if (args.providerMessageId) {
      updates.providerMessageId = args.providerMessageId;
    }
    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }
    
    await ctx.db.patch(args.messageId, updates);
    
    // Update conversation with latest message
    const message = await ctx.db.get(args.messageId);
    if (message && args.status === "sent") {
      await updateConversationLastMessage(ctx, message.teamId, message.patientId, message.body, "outbound");
    }
    
    log.info("Updated message status");
  },
});

// ============================================
// Mutations - Inbound Messages
// ============================================

/**
 * Record an inbound message.
 * Internal-only: called from the inbound SMS webhook handler.
 */
export const createInboundMessage = internalMutation({
  args: {
    teamId: v.id("teams"),
    phone: v.string(),
    body: v.string(),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messages.createInboundMessage", {
      teamId: args.teamId,
      phone: args.phone,
    });

    const normalizedInboundPhone = normalizePhoneNumber(args.phone);
    const inboundWithCountryCode = normalizedInboundPhone.length === 10
      ? `1${normalizedInboundPhone}`
      : normalizedInboundPhone;

    // Find patient by phone number in this team.
    // We support exact/raw, normalized 10-digit, and normalized with leading country code.
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) =>
        q.or(
          q.eq(q.field("phone"), args.phone),
          q.eq(q.field("phone"), normalizedInboundPhone),
          q.eq(q.field("phone"), inboundWithCountryCode),
        )
      )
      .first();
    
    if (!patient) {
      log.warn("No patient found for phone number", {
        phone: args.phone,
        normalizedInboundPhone,
      });
      // TODO: Consider creating a new patient record or queuing for review
      return null;
    }
    
    const now = new Date().toISOString();
    
    // Create message record
    const messageId = await ctx.db.insert("messages", {
      teamId: args.teamId,
      patientId: patient._id,
      direction: "inbound",
      body: args.body,
      phone: patient.phone,
      status: "received",
      createdAt: now,
      providerMessageId: args.providerMessageId,
    });
    
    // Update conversation and increment unread count
    await upsertConversationWithUnread(ctx, args.teamId, patient._id, patient.phone, patient.name || null, args.body);
    
    log.info("Created inbound message", { messageId, patientId: patient._id });
    
    return { messageId, patientId: patient._id };
  },
});

/**
 * Mark a conversation as read
 */
export const markConversationRead = mutation({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messages.markConversationRead", {
      userEmail: args.userEmail,
      patientId: args.patientId,
    });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user || !user.teamId) {
      log.error("User not found or no team");
      throw new Error("User not found");
    }
    
    const teamId = user.teamId;

    // Find conversation
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_team_patient", (q) => 
        q.eq("teamId", teamId).eq("patientId", args.patientId)
      )
      .first();
    
    if (conversation && conversation.unreadCount > 0) {
      await ctx.db.patch(conversation._id, { unreadCount: 0 });
      log.info("Marked conversation as read");
    }
  },
});

// ============================================
// Mutations - System Messages (automated notifications)
// ============================================

/**
 * Record a system-generated outbound message (booking confirmation, cancellation, reminder).
 * Internal-only: called from cron jobs, internal actions, and server-side utilities.
 */
export const createSystemMessageInternal = internalMutation({
  args: {
    teamId: v.id("teams"),
    patientId: v.id("patients"),
    appointmentId: v.optional(v.id("appointments")),
    phone: v.string(),
    body: v.string(),
    messageType: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    providerMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("messages.createSystemMessageInternal", {
      teamId: args.teamId,
      patientId: args.patientId,
      messageType: args.messageType,
    });
    
    const now = new Date().toISOString();
    
    // Create message record
    const messageId = await ctx.db.insert("messages", {
      teamId: args.teamId,
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      direction: "outbound",
      body: args.body,
      phone: args.phone,
      status: args.status,
      createdAt: now,
      sentAt: args.status === "sent" ? now : undefined,
      providerMessageId: args.providerMessageId,
      errorMessage: args.errorMessage,
    });
    
    // Update conversation
    if (args.status === "sent") {
      await upsertConversationForOutbound(ctx, args.teamId, args.patientId, args.phone, args.body);
    }
    
    log.info("Created system message", { messageId, messageType: args.messageType });
    
    return { messageId };
  },
});

// ============================================
// Helper Functions
// ============================================

async function upsertConversationForOutbound(
  ctx: { db: any },
  teamId: any,
  patientId: any,
  patientPhone: string,
  lastMessageBody: string
) {
  const now = new Date().toISOString();
  
  // Get patient name
  const patient = await ctx.db.get(patientId);
  const patientName = patient?.name || null;
  
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_team_patient", (q: any) => 
      q.eq("teamId", teamId).eq("patientId", patientId)
    )
    .first();
  
  if (existing) {
    await ctx.db.patch(existing._id, {
      lastMessageBody: lastMessageBody.slice(0, 100),
      lastMessageDirection: "outbound",
      lastMessageAt: now,
      // Don't change unreadCount for outbound messages
    });
  } else {
    await ctx.db.insert("conversations", {
      teamId,
      patientId,
      patientPhone,
      patientName,
      lastMessageBody: lastMessageBody.slice(0, 100),
      lastMessageDirection: "outbound",
      lastMessageAt: now,
      unreadCount: 0, // No unread for outbound
    });
  }
}

async function updateConversationLastMessage(
  ctx: { db: any },
  teamId: any,
  patientId: any,
  body: string,
  direction: "inbound" | "outbound"
) {
  const now = new Date().toISOString();
  
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_team_patient", (q: any) => 
      q.eq("teamId", teamId).eq("patientId", patientId)
    )
    .first();
  
  if (conversation) {
    await ctx.db.patch(conversation._id, {
      lastMessageBody: body.slice(0, 100), // Truncate for preview
      lastMessageDirection: direction,
      lastMessageAt: now,
    });
  }
}

async function upsertConversationWithUnread(
  ctx: { db: any },
  teamId: any,
  patientId: any,
  patientPhone: string,
  patientName: string | null,
  lastMessageBody: string
) {
  const now = new Date().toISOString();
  
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_team_patient", (q: any) => 
      q.eq("teamId", teamId).eq("patientId", patientId)
    )
    .first();
  
  if (existing) {
    await ctx.db.patch(existing._id, {
      lastMessageBody: lastMessageBody.slice(0, 100),
      lastMessageDirection: "inbound",
      lastMessageAt: now,
      unreadCount: existing.unreadCount + 1,
      patientName: patientName || existing.patientName,
    });
  } else {
    await ctx.db.insert("conversations", {
      teamId,
      patientId,
      patientPhone,
      patientName,
      lastMessageBody: lastMessageBody.slice(0, 100),
      lastMessageDirection: "inbound",
      lastMessageAt: now,
      unreadCount: 1,
    });
  }
}

