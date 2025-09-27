import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      return [];
    }

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
  args: { id: v.id("appointments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("User identity not found. Make sure you are logged in.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      throw new Error("User not found in database.");
    }

    const teamId = user.teamId;

    const appointment = await ctx.db.get(args.id);

    if (appointment && appointment.teamId === teamId) {
      await ctx.db.delete(args.id);
    } else {
      throw new Error("You do not have permission to delete this appointment.");
    }
  },
});
