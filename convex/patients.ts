import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const scheduleAppointment = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    notes: v.optional(v.string()),
    appointmentDateTime: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if patient already exists
    const existingPatient = await ctx.db
      .query("patients")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();

    let patientId;

    if (existingPatient) {
      patientId = existingPatient._id;
    } else {
      // Create a new patient
      patientId = await ctx.db.insert("patients", {
        name: args.name,
        phone: args.phone,
        // The notes from the form are now associated with the appointment
      });
    }

    // Check if appointment already exists for this patient at this time
    const existingAppointment = await ctx.db
      .query("appointments")
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
