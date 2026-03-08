import { describe, expect, it } from "vitest";
import { normalizeEmail, pickCanonicalUserId } from "../convex/lib/emailIdentity";

describe("email identity helpers", () => {
  it("normalizes email using trim + lowercase", () => {
    expect(normalizeEmail("  Doctor@Clinic.COM ")).toBe("doctor@clinic.com");
  });

  it("returns null for missing email", () => {
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("picks the earliest-created user as canonical", () => {
    const canonical = pickCanonicalUserId([
      { _id: "u3", _creationTime: 3000 },
      { _id: "u1", _creationTime: 1000 },
      { _id: "u2", _creationTime: 2000 },
    ]);

    expect(canonical).toBe("u1");
  });
});
