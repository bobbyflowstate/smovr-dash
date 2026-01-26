import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { createQueryLogger, createMutationLogger } from "./lib/logger";

export const get = query({
  args: {
    userEmail: v.string(),
    includeCancelled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("appointments.get", { userEmail: args.userEmail });
    log.debug("Getting appointments for user");

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      log.warn("User not found in database");
      return [];
    }

    log.debug("Found user", { userId: user._id });
    const teamId = user.teamId;

    // Get team information
    const team = await ctx.db.get(teamId);

    let appointmentsQuery = ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId));

    if (!args.includeCancelled) {
      appointmentsQuery = appointmentsQuery.filter((q) => q.neq(q.field("status"), "cancelled"));
    }

    const appointments = await appointmentsQuery.collect();

    const appointmentsWithPatient = await Promise.all(
      appointments.map(async (appointment) => {
        const patient = await ctx.db.get(appointment.patientId);
        return {
          ...appointment,
          patient,
        };
      })
    );

    log.info("Fetched appointments", { count: appointmentsWithPatient.length, teamId });
    return {
      appointments: appointmentsWithPatient,
      teamName: team?.name || "Unknown Team",
      teamTimezone: team?.timezone || null,
      teamHospitalAddress: team?.hospitalAddress || null,
    };
  },
});

export const getById = query({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("appointments.getById", { appointmentId: args.appointmentId });
    const appointment = await ctx.db.get(args.appointmentId);
    log.debug("Fetched appointment", { found: !!appointment });
    return appointment;
  },
});

export const getExistingForPatient = query({
  args: {
    phone: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("appointments.getExistingForPatient", { phone: args.phone });
    log.debug("Checking for existing appointments");

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      log.warn("User not found in database");
      return null;
    }

    const teamId = user.teamId;

    // Find patient by phone number in this team
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) => q.eq(q.field("phone"), args.phone))
      .first();

    if (!patient) {
      log.debug("No patient found for phone");
      return null;
    }

    // Get current time to filter for future appointments only
    const now = new Date().toISOString();

    // Find future appointments for this patient
    const existingAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), patient._id),
          q.gte(q.field("dateTime"), now),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .collect();

    // Return the first (most immediate) future appointment if any
    if (existingAppointments.length === 0) {
      log.debug("No future appointments found for patient");
      return null;
    }

    // Sort by dateTime ascending to get the earliest future appointment
    existingAppointments.sort((a, b) => 
      new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
    );

    const appointment = existingAppointments[0];
    log.info("Found existing appointment", { appointmentId: appointment._id, patientId: patient._id });
    
    return {
      ...appointment,
      patient,
    };
  },
});

export const cancel = mutation({
  args: { 
    id: v.id("appointments"),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("appointments.cancel", { 
      appointmentId: args.id, 
      userEmail: args.userEmail 
    });
    log.info("Canceling appointment");

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      log.error("User not found in database");
      throw new Error("User not found in database.");
    }

    log.debug("Found user", { userId: user._id });
    const teamId = user.teamId;

    const appointment = await ctx.db.get(args.id);

    if (appointment && appointment.teamId === teamId) {
      await ctx.db.patch(args.id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledBy: args.userEmail,
      });
      log.info("Appointment cancelled successfully");
    } else {
      log.warn("Permission denied - appointment not in user's team", { 
        appointmentTeamId: appointment?.teamId, 
        userTeamId: teamId 
      });
      throw new Error("You do not have permission to cancel this appointment.");
    }
  },
});
