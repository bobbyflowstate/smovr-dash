import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const scheduleAppointment = mutation({
  args: {
    phone: v.string(),
    name: v.string(),
    notes: v.optional(v.string()),
    appointmentDateTime: v.string(),
    metadata: v.optional(v.object({})), // Flexible JSON metadata
    userEmail: v.string(), // Pass user email from the authenticated session
  },
  handler: async (ctx, args) => {
    console.log("scheduleAppointment: Starting mutation for user:", args.userEmail);

    // Look up the user by their email (which should be linked to their Logto ID)
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      throw new Error("User not found in database. Please contact support.");
    }

    console.log("scheduleAppointment: Found user:", user._id);
    const teamId = user.teamId;

    // Check if patient already exists in the team
    const existingPatient = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) => q.eq(q.field("phone"), args.phone))
      .first();

    let patientId;

    if (existingPatient) {
      patientId = existingPatient._id;
      // Update the patient's name (overwrite)
      await ctx.db.patch(patientId, { name: args.name });
    } else {
      // Create a new patient with name
      patientId = await ctx.db.insert("patients", {
        phone: args.phone,
        name: args.name,
        teamId,
      });
    }

    // Check if appointment already exists for this patient at this time
    const existingAppointment = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), patientId),
          q.eq(q.field("dateTime"), args.appointmentDateTime)
        )
      )
      .first();

    if (existingAppointment) {
      // Appointment already exists, do nothing
      console.log("Appointment already exists for patient:", patientId);
      return { patientId, appointmentId: existingAppointment._id, teamId, newAppointment: false };
    }

    // Create a new appointment
    const appointmentId = await ctx.db.insert("appointments", {
      patientId,
      dateTime: args.appointmentDateTime,
      notes: args.notes,
      metadata: args.metadata,
      teamId,
    });

    console.log("Created new appointment:", appointmentId);

    return { patientId, appointmentId, teamId, newAppointment: true };
  },
});

// Get patient by ID
export const getById = query({
  args: {
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    return patient;
  },
});

// Get all patients for a team (for autocomplete)
export const getByTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const patients = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    
    // Only return patients that have names
    return patients
      .filter(p => p.name)
      .map(p => ({
        phone: p.phone,
        name: p.name!,
      }));
  },
});
