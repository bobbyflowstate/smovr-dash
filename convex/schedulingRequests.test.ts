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
      entrySlug: "acme-dental",
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

describe("schedulingRequests.createPublic", () => {
  it("creates a patient and scheduling request", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    const result = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "5551234567",
      patientName: "Jane Doe",
      source: "booking_page",
    });

    expect(result.requestId).toBeDefined();
    expect(result.patientId).toBeDefined();
    expect(result.teamId).toBe(teamId);

    // Verify the request was created
    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    const requests = await asSmith.query(api.schedulingRequests.listForTeam, {});
    expect(requests).toHaveLength(1);
    expect(requests[0].patientName).toBe("Jane Doe");
    expect(requests[0].patientPhone).toBe("5551234567");
    expect(requests[0].source).toBe("booking_page");
    expect(requests[0].status).toBe("pending");
  });

  it("reuses existing patient by phone number", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    const r1 = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "5551234567",
      patientName: "Jane",
      source: "booking_page",
    });

    const r2 = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "5551234567",
      patientName: "Jane Updated",
      source: "booking_page",
    });

    expect(r1.patientId).toBe(r2.patientId);

    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    const requests = await asSmith.query(api.schedulingRequests.listForTeam, {});
    expect(requests).toHaveLength(2);
  });

  it("strips non-digit chars from phone", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "(555) 123-4567",
      source: "booking_page",
    });

    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    const requests = await asSmith.query(api.schedulingRequests.listForTeam, {});
    expect(requests[0].patientPhone).toBe("5551234567");
  });
});

describe("schedulingRequests.createPublic rate limiting", () => {
  it("rejects the 4th request from the same phone+team within the window", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);
    const phone = "5559999999";

    for (let i = 0; i < 3; i++) {
      await t.mutation(api.schedulingRequests.createPublic, {
        teamId,
        patientPhone: phone,
        source: "booking_page",
      });
    }

    await expect(
      t.mutation(api.schedulingRequests.createPublic, {
        teamId,
        patientPhone: phone,
        source: "booking_page",
      }),
    ).rejects.toThrow("Too many requests");
  });

  it("allows requests from different phone numbers", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    for (let i = 0; i < 5; i++) {
      await t.mutation(api.schedulingRequests.createPublic, {
        teamId,
        patientPhone: `555000000${i}`,
        source: "booking_page",
      });
    }

    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    const all = await asSmith.query(api.schedulingRequests.listForTeam, {});
    expect(all).toHaveLength(5);
  });

  it("counts only pending requests toward the rate limit", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);
    const phone = "5552222222";

    const first = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: phone,
      source: "booking_page",
    });
    await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: phone,
      source: "booking_page",
    });
    await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: phone,
      source: "booking_page",
    });

    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    await asSmith.mutation(api.schedulingRequests.resolve, {
      requestId: first.requestId,
      status: "scheduled",
    });

    // Should be allowed because only 2 requests remain pending in the window.
    const fourth = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: phone,
      source: "booking_page",
    });
    expect(fourth.requestId).toBeDefined();
  });
});

describe("schedulingRequests.listForTeam", () => {
  it("filters by status when provided", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "5551111111",
      source: "booking_page",
    });

    const asSmith = t.withIdentity({ email: "smith@acme.test" });

    const pending = await asSmith.query(api.schedulingRequests.listForTeam, { status: "pending" });
    expect(pending).toHaveLength(1);

    const scheduled = await asSmith.query(api.schedulingRequests.listForTeam, { status: "scheduled" });
    expect(scheduled).toHaveLength(0);
  });
});

describe("schedulingRequests.resolve", () => {
  it("marks a pending request as scheduled", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    const { requestId } = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "5551234567",
      source: "booking_page",
    });

    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    const result = await asSmith.mutation(api.schedulingRequests.resolve, {
      requestId,
      status: "scheduled",
    });
    expect(result.success).toBe(true);

    const requests = await asSmith.query(api.schedulingRequests.listForTeam, { status: "scheduled" });
    expect(requests).toHaveLength(1);
    expect(requests[0].resolvedAt).toBeDefined();
  });

  it("marks a pending request as dismissed", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    const { requestId } = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "5551234567",
      source: "booking_page",
    });

    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    await asSmith.mutation(api.schedulingRequests.resolve, {
      requestId,
      status: "dismissed",
    });

    const dismissed = await asSmith.query(api.schedulingRequests.listForTeam, { status: "dismissed" });
    expect(dismissed).toHaveLength(1);
  });

  it("throws when resolving an already-resolved request", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    const { requestId } = await t.mutation(api.schedulingRequests.createPublic, {
      teamId,
      patientPhone: "5551234567",
      source: "booking_page",
    });

    const asSmith = t.withIdentity({ email: "smith@acme.test" });
    await asSmith.mutation(api.schedulingRequests.resolve, {
      requestId,
      status: "scheduled",
    });

    await expect(
      asSmith.mutation(api.schedulingRequests.resolve, {
        requestId,
        status: "dismissed",
      }),
    ).rejects.toThrow("already been resolved");
  });
});

describe("teams.getByEntrySlug", () => {
  it("returns team matching the slug", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamAndUser(t);

    const team = await t.query(api.teams.getByEntrySlug, { slug: "acme-dental" });
    expect(team).not.toBeNull();
    expect(team!._id).toBe(teamId);
    expect(team!.name).toBe("Acme Dental");
  });

  it("returns null for unknown slug", async () => {
    const t = convexTest(schema, modules);
    await seedTeamAndUser(t);

    const team = await t.query(api.teams.getByEntrySlug, { slug: "nonexistent" });
    expect(team).toBeNull();
  });
});
