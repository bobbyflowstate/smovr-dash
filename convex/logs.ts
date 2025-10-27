import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a log entry (prevents duplicates)
export const createLog = mutation({
  args: {
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    action: v.string(),
    message: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    // Check if a log already exists for this appointment + action combination
    const existingLog = await ctx.db
      .query("logs")
      .withIndex("by_appointment_action", (q) => 
        q.eq("appointmentId", args.appointmentId).eq("action", args.action)
      )
      .first();

    // If log already exists, return the existing log ID
    if (existingLog) {
      console.log("Duplicate log detected, returning existing log:", existingLog._id);
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
    
    console.log("Created new log:", logId);
    return logId;
  },
});

// Get logs filtered by team, ordered by timestamp descending
export const getLogsByTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Enrich logs with patient and appointment data
    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        const patient = await ctx.db.get(log.patientId);
        const appointment = await ctx.db.get(log.appointmentId);
        
        return {
          _id: log._id,
          _creationTime: log._creationTime,
          timestamp: log.timestamp,
          action: log.action,
          message: log.message,
          patientPhone: patient?.phone || "Unknown",
          appointmentDateTime: appointment?.dateTime || "Unknown",
          appointmentId: log.appointmentId,
          patientId: log.patientId,
        };
      })
    );

    return enrichedLogs;
  },
});
