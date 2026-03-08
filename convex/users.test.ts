import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("users team assignment", () => {
  it("assigns new users to the oldest existing team", async () => {
    const t = convexTest(schema, modules);

    const { oldestTeamId, newerTeamId } = await t.run(async (ctx) => {
      const first = await ctx.db.insert("teams", { name: "Oldest Team" });
      const second = await ctx.db.insert("teams", { name: "Newer Team" });
      return { oldestTeamId: first, newerTeamId: second };
    });

    const userId = await t.mutation(api.users.getOrCreateUserByEmail, {
      email: "new-user@example.com",
      name: "New User",
      logtoUserId: "logto_new_user",
    });

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user).not.toBeNull();
    expect(user!.teamId).toBe(oldestTeamId);
    expect(user!.teamId).not.toBe(newerTeamId);
  });

  it("assigns the oldest team to an existing user missing teamId", async () => {
    const t = convexTest(schema, modules);

    const { oldestTeamId, existingUserId } = await t.run(async (ctx) => {
      const first = await ctx.db.insert("teams", { name: "Oldest Team" });
      await ctx.db.insert("teams", { name: "Newer Team" });

      const userId = await ctx.db.insert("users", {
        name: "Existing User",
        email: "existing@example.com",
        tokenIdentifier: "old_token",
      });

      return { oldestTeamId: first, existingUserId: userId };
    });

    const returnedUserId = await t.mutation(api.users.getOrCreateUserByEmail, {
      email: "existing@example.com",
      name: "Existing User",
      logtoUserId: "new_logto_id",
    });

    expect(returnedUserId).toBe(existingUserId);

    const user = await t.run(async (ctx) => ctx.db.get(existingUserId));
    expect(user).not.toBeNull();
    expect(user!.teamId).toBe(oldestTeamId);
  });
});
