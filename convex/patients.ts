import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { createMutationLogger, createQueryLogger } from "./lib/logger";

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
    const log = createMutationLogger("patients.scheduleAppointment", { 
      userEmail: args.userEmail,
      phone: args.phone,
    });
    log.info("Scheduling appointment");

    // Look up the user by their email (which should be linked to their Logto ID)
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      log.error("User not found in database");
      throw new Error("User not found in database. Please contact support.");
    }

    log.debug("Found user", { userId: user._id });
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
      log.debug("Updated existing patient", { patientId });
    } else {
      // Create a new patient with name
      patientId = await ctx.db.insert("patients", {
        phone: args.phone,
        name: args.name,
        teamId,
      });
      log.debug("Created new patient", { patientId });
    }

    // Check if appointment already exists for this patient at this time
    const existingAppointment = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), patientId),
          q.eq(q.field("dateTime"), args.appointmentDateTime),
          // Cancelled appointments should not block re-booking at the same time.
          q.neq(q.field("status"), "cancelled")
        )
      )
      .first();

    if (existingAppointment) {
      log.info("Appointment already exists", { appointmentId: existingAppointment._id, patientId });
      return { patientId, appointmentId: existingAppointment._id, teamId, newAppointment: false };
    }

    // Create a new appointment
    const appointmentId = await ctx.db.insert("appointments", {
      patientId,
      dateTime: args.appointmentDateTime,
      notes: args.notes,
      metadata: args.metadata,
      status: "scheduled",
      teamId,
    });

    log.info("Created new appointment", { appointmentId, patientId, teamId });
    return { patientId, appointmentId, teamId, newAppointment: true };
  },
});

// Get patient by ID
export const getById = query({
  args: {
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("patients.getById", { patientId: args.patientId });
    const patient = await ctx.db.get(args.patientId);
    log.debug("Fetched patient", { found: !!patient });
    return patient;
  },
});

// Get all patients for a team (for autocomplete)
export const getByTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("patients.getByTeam", { teamId: args.teamId });
    
    const patients = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    
    // Only return patients that have names
    const patientsWithNames = patients
      .filter(p => p.name)
      .map(p => ({
        phone: p.phone,
        name: p.name!,
      }));
    
    log.debug("Fetched patients for team", { total: patients.length, withNames: patientsWithNames.length });
    return patientsWithNames;
  },
});

// ============================================
// Patient Management Queries
// ============================================

/**
 * Get all patients for a team with full details
 */
export const listForTeam = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("patients.listForTeam", { userEmail: args.userEmail });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.error("User not found");
      return [];
    }
    
    const patients = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();
    
    // Avoid N+1: fetch upcoming appointments once, then aggregate counts per patient.
    const now = new Date().toISOString();
    const upcomingAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "cancelled"),
          q.gte(q.field("dateTime"), now)
        )
      )
      .collect();

    const upcomingByPatient = new Map<string, number>();
    for (const appt of upcomingAppointments) {
      const key = String(appt.patientId);
      upcomingByPatient.set(key, (upcomingByPatient.get(key) || 0) + 1);
    }

    const patientsWithStats = patients.map((patient) => ({
      ...patient,
      upcomingAppointments: upcomingByPatient.get(String(patient._id)) || 0,
    }));
    
    log.debug("Fetched patients with stats", { count: patientsWithStats.length });
    return patientsWithStats;
  },
});

/**
 * Get a single patient with their appointment history
 */
export const getWithHistory = query({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("patients.getWithHistory", { 
      userEmail: args.userEmail,
      patientId: args.patientId,
    });
    
    // Get user to verify team access
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.error("User not found");
      return null;
    }
    
    const patient = await ctx.db.get(args.patientId);
    
    if (!patient || patient.teamId !== user.teamId) {
      log.error("Patient not found or not in user's team");
      return null;
    }
    
    // Get all appointments for this patient
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .filter((q) => q.eq(q.field("patientId"), patient._id))
      .collect();
    
    // Sort by date descending
    appointments.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    
    log.debug("Fetched patient with history", { appointmentCount: appointments.length });
    
    return {
      ...patient,
      appointments,
    };
  },
});

// ============================================
// Patient Management Mutations
// ============================================

/**
 * Update a patient's information
 */
export const update = mutation({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    birthday: v.optional(v.string()), // ISO date string (YYYY-MM-DD) or empty string to clear
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("patients.update", { 
      userEmail: args.userEmail,
      patientId: args.patientId,
    });
    
    // Get user to verify team access
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.error("User not found");
      throw new Error("User not found");
    }
    
    const patient = await ctx.db.get(args.patientId);
    
    if (!patient || patient.teamId !== user.teamId) {
      log.error("Patient not found or not in user's team");
      throw new Error("Patient not found");
    }
    
    // Build update object with only provided fields
    const updates: Record<string, string | undefined> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.birthday !== undefined) updates.birthday = args.birthday || undefined; // Empty string clears
    
    await ctx.db.patch(args.patientId, updates);
    
    log.info("Updated patient", { updates: Object.keys(updates) });
    
    return { success: true };
  },
});

/**
 * Create a new patient
 */
export const create = mutation({
  args: {
    userEmail: v.string(),
    name: v.string(),
    phone: v.string(),
    notes: v.optional(v.string()),
    birthday: v.optional(v.string()), // ISO date string (YYYY-MM-DD)
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("patients.create", { 
      userEmail: args.userEmail,
      phone: args.phone,
    });
    
    // Get user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.error("User not found");
      throw new Error("User not found");
    }
    
    // Check if patient with this phone already exists in the team
    const existing = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .filter((q) => q.eq(q.field("phone"), args.phone))
      .first();
    
    if (existing) {
      log.warn("Patient with this phone already exists", { existingId: existing._id });
      throw new Error("A patient with this phone number already exists");
    }
    
    const patientId = await ctx.db.insert("patients", {
      teamId: user.teamId,
      name: args.name,
      phone: args.phone,
      notes: args.notes,
      birthday: args.birthday,
    });
    
    log.info("Created patient", { patientId });
    
    return { patientId };
  },
});

/**
 * Delete a patient (only if they have no appointments)
 */
export const remove = mutation({
  args: {
    userEmail: v.string(),
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    const log = createMutationLogger("patients.remove", { 
      userEmail: args.userEmail,
      patientId: args.patientId,
    });
    
    // Get user to verify team access
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    
    if (!user) {
      log.error("User not found");
      throw new Error("User not found");
    }
    
    const patient = await ctx.db.get(args.patientId);
    
    if (!patient || patient.teamId !== user.teamId) {
      log.error("Patient not found or not in user's team");
      throw new Error("Patient not found");
    }
    
    // Check if patient has any appointments
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .filter((q) => q.eq(q.field("patientId"), patient._id))
      .first();
    
    if (appointments) {
      log.warn("Cannot delete patient with appointments");
      throw new Error("Cannot delete patient with appointment history. Consider updating their information instead.");
    }
    
    await ctx.db.delete(args.patientId);
    
    log.info("Deleted patient");
    
    return { success: true };
  },
});
