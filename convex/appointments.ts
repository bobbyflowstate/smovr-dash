import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("appointments.get: Getting appointments for user:", args.userEmail);

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      console.log("appointments.get: User not found in database");
      return [];
    }

    console.log("appointments.get: Found user:", user._id);
    const teamId = user.teamId;

    // Get team information
    const team = await ctx.db.get(teamId);

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const appointmentsWithPatient = await Promise.all(
      appointments.map(async (appointment) => {
        const patient = await ctx.db.get(appointment.patientId);
        return {
          ...appointment,
          patient,
        };
      })
    );

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
    const appointment = await ctx.db.get(args.appointmentId);
    return appointment;
  },
});

export const getExistingForPatient = query({
  args: {
    phone: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("appointments.getExistingForPatient: Checking for existing appointments for phone:", args.phone);

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      console.log("appointments.getExistingForPatient: User not found in database");
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
      // No patient found, so no existing appointments
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
          q.gte(q.field("dateTime"), now)
        )
      )
      .collect();

    // Return the first (most immediate) future appointment if any
    if (existingAppointments.length === 0) {
      return null;
    }

    // Sort by dateTime ascending to get the earliest future appointment
    existingAppointments.sort((a, b) => 
      new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
    );

    const appointment = existingAppointments[0];
    
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
    console.log("appointments.cancel: Canceling appointment for user:", args.userEmail);

    // Look up the user by their email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      throw new Error("User not found in database.");
    }

    console.log("appointments.cancel: Found user:", user._id);
    const teamId = user.teamId;

    const appointment = await ctx.db.get(args.id);

    if (appointment && appointment.teamId === teamId) {
      await ctx.db.delete(args.id);
    } else {
      throw new Error("You do not have permission to delete this appointment.");
    }
  },
});
