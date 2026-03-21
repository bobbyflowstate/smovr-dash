import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("users team assignment", () => {
  it("auto-assigns user to the sole team in single-team deployment", async () => {
    const t = convexTest(schema, modules);

    const { soleTeamId } = await t.run(async (ctx) => {
      const id = await ctx.db.insert("teams", { name: "Only Team" });
      return { soleTeamId: id };
    });

    const userId = await t.mutation(api.users.getOrCreateUserByEmail, {
      email: "new-user@example.com",
      name: "New User",
      logtoUserId: "logto_new_user",
    });

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user).not.toBeNull();
    expect(user!.teamId).toBe(soleTeamId);
  });

  it("does NOT auto-assign when multiple teams exist", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("teams", { name: "Team A" });
      await ctx.db.insert("teams", { name: "Team B" });
    });

    const userId = await t.mutation(api.users.getOrCreateUserByEmail, {
      email: "new-user@example.com",
      name: "New User",
      logtoUserId: "logto_new_user",
    });

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user).not.toBeNull();
    expect(user!.teamId).toBeUndefined();
  });

  it("auto-assigns existing user to sole team when missing teamId", async () => {
    const t = convexTest(schema, modules);

    const { soleTeamId, existingUserId } = await t.run(async (ctx) => {
      const teamId = await ctx.db.insert("teams", { name: "Only Team" });
      const userId = await ctx.db.insert("users", {
        name: "Existing User",
        email: "existing@example.com",
        tokenIdentifier: "old_token",
      });
      return { soleTeamId: teamId, existingUserId: userId };
    });

    const returnedUserId = await t.mutation(api.users.getOrCreateUserByEmail, {
      email: "existing@example.com",
      name: "Existing User",
      logtoUserId: "new_logto_id",
    });

    expect(returnedUserId).toBe(existingUserId);

    const user = await t.run(async (ctx) => ctx.db.get(existingUserId));
    expect(user).not.toBeNull();
    expect(user!.teamId).toBe(soleTeamId);
  });

  it("skips archived teams when auto-assigning", async () => {
    const t = convexTest(schema, modules);

    const { activeTeamId } = await t.run(async (ctx) => {
      await ctx.db.insert("teams", { name: "Archived Team", isArchived: true, archivedAt: new Date().toISOString() });
      const id = await ctx.db.insert("teams", { name: "Active Team" });
      return { activeTeamId: id };
    });

    const userId = await t.mutation(api.users.getOrCreateUserByEmail, {
      email: "new-user@example.com",
      name: "New User",
      logtoUserId: "logto_new",
    });

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user).not.toBeNull();
    expect(user!.teamId).toBe(activeTeamId);
  });
});
