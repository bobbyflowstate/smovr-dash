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

    return appointmentsWithPatient;
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
