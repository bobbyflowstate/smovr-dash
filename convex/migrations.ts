import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api.js";
import { DataModel } from "./_generated/dataModel.js";
import { internal } from "./_generated/api.js";

export const migrations = new Migrations<DataModel>(components.migrations);

const DEFAULT_HOSPITAL_ADDRESS =
  process.env.HOSPITAL_ADDRESS ||
  "123 Medical Center Drive, Suite 456, San Francisco, CA 94102";
const DEFAULT_TIMEZONE = process.env.APPOINTMENT_TIMEZONE || "America/Los_Angeles";

// Define migration to remove name field from patients
export const removePatientNames = migrations.define({
  table: "patients",
  migrateOne: async (ctx, patient) => {
    console.log(`Migrating patient ${patient._id}: removing name field`);
    
    // Remove name field using shorthand syntax (returns patch object)
    const { name, ...patientWithoutName } = patient as any;
    return patientWithoutName;
  },
});

// Runner for individual migration
export const runRemoveNames = migrations.runner();

// Backfill team timezone + hospitalAddress so Next.js and Convex format consistently.
export const backfillTeamSettings = migrations.define({
  table: "teams",
  migrateOne: async (_ctx, team) => {
    const t = team as any;
    const timezone = t.timezone || DEFAULT_TIMEZONE;
    const hospitalAddress = t.hospitalAddress || DEFAULT_HOSPITAL_ADDRESS;
    return { ...t, timezone, hospitalAddress };
  },
});

// Backfill appointment status so we can keep cancelled appointments for audit/history.
export const backfillAppointmentStatus = migrations.define({
  table: "appointments",
  migrateOne: async (_ctx, appt) => {
    const a = appt as any;
    const status = a.status || "scheduled";
    return { ...a, status };
  },
});

// Runner for all migrations
export const runAll = migrations.runner([
  internal.migrations.removePatientNames,
  internal.migrations.backfillTeamSettings,
  internal.migrations.backfillAppointmentStatus,
]);
