import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("patients.listForTeam", () => {
  it("returns correct upcoming appointment counts per patient", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const teamId = await ctx.db.insert("teams", { name: "Acme Dental" });
      await ctx.db.insert("users", {
        name: "Dr. Smith",
        email: "smith@acme.test",
        tokenIdentifier: "tok-smith",
        teamId,
      });

      const patientA = await ctx.db.insert("patients", {
        teamId,
        name: "Alice",
        phone: "+15550000001",
      });
      const patientB = await ctx.db.insert("patients", {
        teamId,
        name: "Bob",
        phone: "+15550000002",
      });

      const now = Date.now();
      const future1 = new Date(now + 60 * 60 * 1000).toISOString();
      const future2 = new Date(now + 2 * 60 * 60 * 1000).toISOString();
      const past = new Date(now - 60 * 60 * 1000).toISOString();

      // Patient A: 2 upcoming active + 1 cancelled upcoming (excluded)
      await ctx.db.insert("appointments", {
        teamId,
        patientId: patientA,
        dateTime: future1,
        status: "scheduled",
      });
      await ctx.db.insert("appointments", {
        teamId,
        patientId: patientA,
        dateTime: future2,
        status: "scheduled",
      });
      await ctx.db.insert("appointments", {
        teamId,
        patientId: patientA,
        dateTime: future2,
        status: "cancelled",
      });

      // Patient B: past appointment only (excluded)
      await ctx.db.insert("appointments", {
        teamId,
        patientId: patientB,
        dateTime: past,
        status: "scheduled",
      });
    });

    const result = await t.query(api.patients.listForTeam, {
      userEmail: "smith@acme.test",
    });

    const byName = Object.fromEntries(result.map((p: any) => [p.name, p.upcomingAppointments]));
    expect(byName.Alice).toBe(2);
    expect(byName.Bob).toBe(0);
  });
});
