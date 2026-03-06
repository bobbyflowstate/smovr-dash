import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function seedTeamAndUser(t: ReturnType<typeof convexTest>) {
  let teamId: any;
  await t.run(async (ctx) => {
    teamId = await ctx.db.insert("teams", {
      name: "Acme Dental",
      timezone: "America/Phoenix",
      hospitalAddress: "123 Main St",
    });
    await ctx.db.insert("users", {
      name: "Dr. Smith",
      email: "smith@acme.test",
      tokenIdentifier: "tok-smith",
      teamId,
    });
  });
  return { teamId };
}

describe("teamSettings.get", () => {
  it("returns settings with languageMode defaulting to en_es", async () => {
    const t = convexTest(schema, modules);
    await seedTeamAndUser(t);
    const asSmith = t.withIdentity({ email: "smith@acme.test" });

    const settings = await asSmith.query(api.teamSettings.get, {});

    expect(settings.name).toBe("Acme Dental");
    expect(settings.timezone).toBe("America/Phoenix");
    expect(settings.languageMode).toBe("en_es");
    expect(settings.rescheduleUrl).toBeUndefined();
    expect(settings.entrySlug).toBeUndefined();
  });
});

describe("teamSettings.update", () => {
  it("updates languageMode", async () => {
    const t = convexTest(schema, modules);
    await seedTeamAndUser(t);
    const asSmith = t.withIdentity({ email: "smith@acme.test" });

    await asSmith.mutation(api.teamSettings.update, { languageMode: "en" });
    const settings = await asSmith.query(api.teamSettings.get, {});

    expect(settings.languageMode).toBe("en");
  });

  it("updates rescheduleUrl and entrySlug", async () => {
    const t = convexTest(schema, modules);
    await seedTeamAndUser(t);
    const asSmith = t.withIdentity({ email: "smith@acme.test" });

    await asSmith.mutation(api.teamSettings.update, {
      rescheduleUrl: "https://book.example.com",
      entrySlug: "acme",
    });
    const settings = await asSmith.query(api.teamSettings.get, {});

    expect(settings.rescheduleUrl).toBe("https://book.example.com");
    expect(settings.entrySlug).toBe("acme");
  });

  it("clears optional fields when set to empty string", async () => {
    const t = convexTest(schema, modules);
    await seedTeamAndUser(t);
    const asSmith = t.withIdentity({ email: "smith@acme.test" });

    await asSmith.mutation(api.teamSettings.update, {
      rescheduleUrl: "https://book.example.com",
      entrySlug: "acme",
    });
    await asSmith.mutation(api.teamSettings.update, {
      rescheduleUrl: "",
      entrySlug: "",
    });
    const settings = await asSmith.query(api.teamSettings.get, {});

    expect(settings.rescheduleUrl).toBeUndefined();
    expect(settings.entrySlug).toBeUndefined();
  });

  it("updates team name", async () => {
    const t = convexTest(schema, modules);
    await seedTeamAndUser(t);
    const asSmith = t.withIdentity({ email: "smith@acme.test" });

    await asSmith.mutation(api.teamSettings.update, { name: "Acme Dental Renamed" });
    const settings = await asSmith.query(api.teamSettings.get, {});

    expect(settings.name).toBe("Acme Dental Renamed");
  });
});
