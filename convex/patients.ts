import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const scheduleAppointment = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    notes: v.optional(v.string()),
    appointmentDateTime: v.string(),
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
    } else {
      // Create a new patient
      patientId = await ctx.db.insert("patients", {
        name: args.name,
        phone: args.phone,
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
      return { patientId, appointmentId: existingAppointment._id, newAppointment: false };
    }

    // Create a new appointment
    const appointmentId = await ctx.db.insert("appointments", {
      patientId,
      dateTime: args.appointmentDateTime,
      notes: args.notes,
      teamId,
    });

    // Webhook placeholder
    console.log("Calling webhook for new appointment:", appointmentId);
    try {
      await fetch("https://google.com", { method: "POST", body: JSON.stringify(args) });
      console.log("Webhook call successful");
    } catch (error) {
      console.error("Webhook call failed:", error);
    }

    return { patientId, appointmentId, newAppointment: true };
  },
});
