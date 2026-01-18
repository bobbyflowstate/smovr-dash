/**
 * Audit Logs
 *
 * These are patient action logs - recording when patients respond to
 * appointment notifications (e.g., "I'm running 15 minutes late").
 *
 * Note: The underlying Convex table is named "logs" for backward compatibility.
 * This file provides the audit log functionality.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createMutationLogger, createQueryLogger } from "./lib/logger";

// Create an audit log entry (prevents duplicates)
export const createAuditLog = mutation({
  args: {
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    action: v.string(),
    message: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("auditLogs.createAuditLog", {
      appointmentId: args.appointmentId,
      action: args.action,
    });

    // Check if a log already exists for this appointment + action combination
    const existingLog = await ctx.db
      .query("logs")
      .withIndex("by_appointment_action", (q) => 
        q.eq("appointmentId", args.appointmentId).eq("action", args.action)
      )
      .first();

    // If log already exists, return the existing log ID
    if (existingLog) {
      log.info("Duplicate audit log detected, returning existing", { existingLogId: existingLog._id });
      return existingLog._id;
    }

    // Create new log entry
    const logId = await ctx.db.insert("logs", {
      appointmentId: args.appointmentId,
      patientId: args.patientId,
      action: args.action,
      message: args.message,
      teamId: args.teamId,
      timestamp: new Date().toISOString(),
    });
    
    log.info("Created new audit log", { logId });
    return logId;
  },
});

// Get audit logs filtered by team, ordered by timestamp descending
export const getAuditLogsByTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("auditLogs.getAuditLogsByTeam", {
      teamId: args.teamId,
    });

    const logs = await ctx.db
      .query("logs")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Enrich logs with patient and appointment data
    const enrichedLogs = await Promise.all(
      logs.map(async (auditLog) => {
        const patient = await ctx.db.get(auditLog.patientId);
        const appointment = await ctx.db.get(auditLog.appointmentId);
        
        return {
          _id: auditLog._id,
          _creationTime: auditLog._creationTime,
          timestamp: auditLog.timestamp,
          action: auditLog.action,
          message: auditLog.message,
          patientPhone: patient?.phone || "Unknown",
          patientName: patient?.name || "Unknown",
          appointmentDateTime: appointment?.dateTime || "Unknown",
          appointmentId: auditLog.appointmentId,
          patientId: auditLog.patientId,
        };
      })
    );

    log.info("Fetched audit logs", { count: enrichedLogs.length });
    return enrichedLogs;
  },
});

// Backward compatibility aliases
/** @deprecated Use createAuditLog instead */
export const createLog = createAuditLog;
/** @deprecated Use getAuditLogsByTeam instead */
export const getLogsByTeam = getAuditLogsByTeam;

