import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("proReminders.getPatientsWithBirthday", () => {
  it("matches both MM-DD and legacy YYYY-MM-DD birthdays", async () => {
    const t = convexTest(schema, modules);

    let teamId: any;
    await t.run(async (ctx) => {
      teamId = await ctx.db.insert("teams", { name: "Clinic A" });
      await ctx.db.insert("patients", {
        teamId,
        phone: "5551111111",
        name: "Legacy Birthday",
        birthday: "1990-03-08",
      });
      await ctx.db.insert("patients", {
        teamId,
        phone: "5551111112",
        name: "Modern Birthday",
        birthday: "03-08",
      });
      await ctx.db.insert("patients", {
        teamId,
        phone: "5551111113",
        name: "Different Day",
        birthday: "03-09",
      });
    });

    const matches = await t.query(internal.proReminders.getPatientsWithBirthday, {
      teamId,
      todayMMDD: "03-08",
    });

    expect(matches.map((p) => p.name).sort()).toEqual(["Legacy Birthday", "Modern Birthday"]);
  });
});

describe("proReminders.sendReactivationMessages", () => {
  it("only sends to patients in the provided team", async () => {
    const t = convexTest(schema, modules);

    let teamA: any;
    let teamB: any;
    let patientA: any;
    let patientB: any;

    await t.run(async (ctx) => {
      teamA = await ctx.db.insert("teams", {
        name: "Team A",
        languageMode: "en",
      });
      teamB = await ctx.db.insert("teams", {
        name: "Team B",
        languageMode: "en",
      });

      patientA = await ctx.db.insert("patients", {
        teamId: teamA,
        phone: "5552000001",
        name: "Team A Patient",
      });
      patientB = await ctx.db.insert("patients", {
        teamId: teamB,
        phone: "5552000002",
        name: "Team B Patient",
      });
    });

    const result = await t.action(internal.proReminders.sendReactivationMessages, {
      teamId: teamA,
      patientIds: [patientA, patientB],
    });

    expect(result).toEqual({ sent: 1, failed: 1 });

    await t.run(async (ctx) => {
      const messages = await ctx.db.query("messages").collect();
      expect(messages).toHaveLength(1);
      expect(messages[0].patientId).toBe(patientA);
      expect(messages[0].teamId).toBe(teamA);
    });
  });
});
