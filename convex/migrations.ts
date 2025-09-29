import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api.js";
import { DataModel } from "./_generated/dataModel.js";
import { internal } from "./_generated/api.js";

export const migrations = new Migrations<DataModel>(components.migrations);

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

// Runner for all migrations
export const runAll = migrations.runner([internal.migrations.removePatientNames]);
