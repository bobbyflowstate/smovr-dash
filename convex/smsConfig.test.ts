import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { Id } from "./_generated/dataModel";

/** Seed a team + user, return their IDs. */
async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", { name: "Acme Dental" });
    const userId = await ctx.db.insert("users", {
      name: "Dr. Smith",
      email: "smith@acme.test",
      tokenIdentifier: "tok-smith",
      teamId,
    });
    return { teamId, userId };
  });
}

/** Seed a team + user + SMS config row. */
async function seedWithConfig(
  t: ReturnType<typeof convexTest>,
  configOverrides: Partial<{
    provider: "ghl" | "twilio" | "mock";
    isEnabled: boolean;
    webhookUrl: string;
    inboundWebhookSecret: string;
  }> = {},
) {
  return t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", { name: "Acme Dental" });
    const userId = await ctx.db.insert("users", {
      name: "Dr. Smith",
      email: "smith@acme.test",
      tokenIdentifier: "tok-smith",
      teamId,
    });
    const configId = await ctx.db.insert("teamSmsConfig", {
      teamId,
      provider: configOverrides.provider ?? "ghl",
      isEnabled: configOverrides.isEnabled ?? true,
      webhookUrl: configOverrides.webhookUrl ?? "https://hooks.example.test",
      inboundWebhookSecret: configOverrides.inboundWebhookSecret,
    });
    return { teamId, userId, configId };
  });
}

// ─── getByTeamId ──────────────────────────────────────────────────────────────

describe("smsConfig.getByTeamId", () => {
  it("returns the full config when it exists", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedWithConfig(t, {
      inboundWebhookSecret: "secret-123",
    });

    const config = await t.query(internal.smsConfig.getByTeamId, { teamId });

    expect(config).not.toBeNull();
    expect(config!.provider).toBe("ghl");
    expect(config!.isEnabled).toBe(true);
    expect(config!.inboundWebhookSecret).toBe("secret-123");
  });

  it("returns null when no config exists", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seed(t);

    const config = await t.query(internal.smsConfig.getByTeamId, { teamId });

    expect(config).toBeNull();
  });

  it("returns the correct config when multiple teams exist", async () => {
    const t = convexTest(schema, modules);
    const { teamId: team1 } = await seedWithConfig(t, { provider: "ghl" });

    const team2 = await t.run(async (ctx) => {
      const tid = await ctx.db.insert("teams", { name: "Beta Ortho" });
      await ctx.db.insert("teamSmsConfig", {
        teamId: tid,
        provider: "twilio",
        isEnabled: false,
      });
      return tid;
    });

    const config1 = await t.query(internal.smsConfig.getByTeamId, { teamId: team1 });
    const config2 = await t.query(internal.smsConfig.getByTeamId, { teamId: team2 });

    expect(config1!.provider).toBe("ghl");
    expect(config2!.provider).toBe("twilio");
  });

  it("throws when duplicate configs exist for one team", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedWithConfig(t, { provider: "ghl" });
    await t.run(async (ctx) => {
      await ctx.db.insert("teamSmsConfig", {
        teamId,
        provider: "mock",
        isEnabled: true,
      });
    });

    await expect(
      t.query(internal.smsConfig.getByTeamId, { teamId }),
    ).rejects.toThrowError("Duplicate SMS configuration rows found for team.");
  });
});

// ─── getForCurrentUser ────────────────────────────────────────────────────────

describe("smsConfig.getForCurrentUser", () => {
  it("redacts inboundWebhookSecret and sets hasWebhookSecret: true", async () => {
    const t = convexTest(schema, modules);
    await seedWithConfig(t, { inboundWebhookSecret: "s3cr3t" });

    const config = await t.query(api.smsConfig.getForCurrentUser, {
      userEmail: "smith@acme.test",
    });

    expect(config).not.toBeNull();
    expect(config!.hasWebhookSecret).toBe(true);
    expect((config as any).inboundWebhookSecret).toBeUndefined();
  });

  it("returns hasWebhookSecret: false when no secret is set", async () => {
    const t = convexTest(schema, modules);
    await seedWithConfig(t);

    const config = await t.query(api.smsConfig.getForCurrentUser, {
      userEmail: "smith@acme.test",
    });

    expect(config).not.toBeNull();
    expect(config!.hasWebhookSecret).toBe(false);
  });

  it("returns null when user email is not found", async () => {
    const t = convexTest(schema, modules);
    await seedWithConfig(t);

    const config = await t.query(api.smsConfig.getForCurrentUser, {
      userEmail: "nobody@nowhere.test",
    });

    expect(config).toBeNull();
  });
});

// ─── upsert ───────────────────────────────────────────────────────────────────

describe("smsConfig.upsert", () => {
  it("creates a new config when none exists", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seed(t);

    await t.mutation(api.smsConfig.upsert, {
      userEmail: "smith@acme.test",
      provider: "twilio",
      isEnabled: true,
    });

    const config = await t.query(internal.smsConfig.getByTeamId, { teamId });
    expect(config).not.toBeNull();
    expect(config!.provider).toBe("twilio");
    expect(config!.isEnabled).toBe(true);
  });

  it("updates existing config instead of creating a duplicate", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedWithConfig(t, { provider: "ghl" });

    await t.mutation(api.smsConfig.upsert, {
      userEmail: "smith@acme.test",
      provider: "twilio",
      isEnabled: false,
    });

    // Verify only one config exists and it's updated
    const allConfigs = await t.run(async (ctx) => {
      return ctx.db
        .query("teamSmsConfig")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();
    });

    expect(allConfigs).toHaveLength(1);
    expect(allConfigs[0].provider).toBe("twilio");
    expect(allConfigs[0].isEnabled).toBe(false);
  });

  it("throws when userEmail does not match any user", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(
      t.mutation(api.smsConfig.upsert, {
        userEmail: "ghost@nowhere.test",
        provider: "ghl",
        isEnabled: true,
      }),
    ).rejects.toThrowError("User not found");
  });

  it("throws when duplicate configs exist for the user's team", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedWithConfig(t, { provider: "ghl" });
    await t.run(async (ctx) => {
      await ctx.db.insert("teamSmsConfig", {
        teamId,
        provider: "mock",
        isEnabled: true,
      });
    });

    await expect(
      t.mutation(api.smsConfig.upsert, {
        userEmail: "smith@acme.test",
        provider: "twilio",
        isEnabled: true,
      }),
    ).rejects.toThrowError("Duplicate SMS configuration rows found for team.");
  });
});

// ─── setEnabled ───────────────────────────────────────────────────────────────

describe("smsConfig.setEnabled", () => {
  it("toggles isEnabled from true to false", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedWithConfig(t, { isEnabled: true });

    await t.mutation(api.smsConfig.setEnabled, {
      userEmail: "smith@acme.test",
      isEnabled: false,
    });

    const config = await t.query(internal.smsConfig.getByTeamId, { teamId });
    expect(config!.isEnabled).toBe(false);
  });

  it("throws when no SMS config exists for the team", async () => {
    const t = convexTest(schema, modules);
    await seed(t); // no config seeded

    await expect(
      t.mutation(api.smsConfig.setEnabled, {
        userEmail: "smith@acme.test",
        isEnabled: false,
      }),
    ).rejects.toThrowError("SMS configuration not found");
  });
});
