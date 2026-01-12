import { describe, expect, it } from "vitest";
import { formatPhoneForDisplay, normalizePhoneForTel } from "../src/lib/phone-utils";

describe("phone-utils", () => {
  it("formats US E.164 for display", () => {
    expect(formatPhoneForDisplay("+15551234567")).toBe("(555) 123-4567");
    expect(normalizePhoneForTel("+15551234567")).toBe("+15551234567");
  });

  it("normalizes 10-digit US numbers to E.164", () => {
    expect(formatPhoneForDisplay("5551234567")).toBe("(555) 123-4567");
    expect(normalizePhoneForTel("5551234567")).toBe("+15551234567");
  });

  it("handles common punctuation", () => {
    expect(formatPhoneForDisplay("(415) 555-0000")).toBe("(415) 555-0000");
    expect(normalizePhoneForTel("(415) 555-0000")).toBe("+14155550000");
  });

  it("returns null for empty/invalid", () => {
    expect(formatPhoneForDisplay("")).toBeNull();
    expect(normalizePhoneForTel("")).toBeNull();
    expect(normalizePhoneForTel("abc")).toBeNull();
  });
});


