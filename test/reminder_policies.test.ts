import { describe, expect, it } from "vitest";
import {
  BOOKING_SUPPRESS_1H_END,
  BOOKING_SUPPRESS_1H_START,
  BOOKING_SUPPRESS_24H_END,
  BOOKING_SUPPRESS_24H_START,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  isInQuietHours,
  mapWebhookFailureToReason,
  noteForAttempt,
} from "../convex/reminder_policies";
import { REMINDER_WINDOWS_HOURS } from "../convex/reminder_logic";

describe("reminder policies", () => {
  it("quiet hours (22->5) include late night and early morning", () => {
    expect(isInQuietHours(21, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)).toBe(false);
    expect(isInQuietHours(22, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)).toBe(true);
    expect(isInQuietHours(23, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)).toBe(true);
    expect(isInQuietHours(0, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)).toBe(true);
    expect(isInQuietHours(4, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)).toBe(true);
    expect(isInQuietHours(5, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)).toBe(false);
  });

  it("24h booking suppression window is aligned with 24h send window constants", () => {
    expect(BOOKING_SUPPRESS_24H_START).toBe(REMINDER_WINDOWS_HOURS["24h"].startInclusive);
    expect(BOOKING_SUPPRESS_24H_END).toBe(REMINDER_WINDOWS_HOURS["24h"].endExclusive);
  });

  it("booking suppression 1h window remains 1h..1h15m", () => {
    expect(BOOKING_SUPPRESS_1H_START).toBeCloseTo(1, 6);
    expect(BOOKING_SUPPRESS_1H_END).toBeCloseTo(1.25, 6);
  });

  it("maps webhook failure reasons to stable reason codes", () => {
    expect(
      mapWebhookFailureToReason({
        ok: true,
        attemptCount: 1,
        httpStatus: 200,
        failureReason: null,
        errorMessage: null,
      })
    ).toBe("SENT");

    expect(
      mapWebhookFailureToReason({
        ok: false,
        attemptCount: 0,
        httpStatus: null,
        failureReason: "WEBHOOK_URL_NOT_CONFIGURED",
        errorMessage: null,
      })
    ).toBe("WEBHOOK_URL_NOT_CONFIGURED");

    expect(
      mapWebhookFailureToReason({
        ok: false,
        attemptCount: 2,
        httpStatus: 400,
        failureReason: "HTTP_NON_RETRYABLE",
        errorMessage: null,
      })
    ).toBe("WEBHOOK_HTTP_NON_RETRYABLE");

    expect(
      mapWebhookFailureToReason({
        ok: false,
        attemptCount: 4,
        httpStatus: 503,
        failureReason: "HTTP_RETRY_EXHAUSTED",
        errorMessage: null,
      })
    ).toBe("WEBHOOK_HTTP_RETRY_EXHAUSTED");

    expect(
      mapWebhookFailureToReason({
        ok: false,
        attemptCount: 1,
        httpStatus: null,
        failureReason: "TIMEOUT",
        errorMessage: "timeout",
      })
    ).toBe("WEBHOOK_TIMEOUT");

    expect(
      mapWebhookFailureToReason({
        ok: false,
        attemptCount: 1,
        httpStatus: null,
        failureReason: "NETWORK_ERROR",
        errorMessage: "Network error",
      })
    ).toBe("WEBHOOK_NETWORK_ERROR");
  });

  it("success note mentions possible delivery delay", () => {
    const note = noteForAttempt("succeeded", "SENT");
    expect(note).toContain("sent successfully");
    expect(note).toContain("1–3 minutes");
  });

  it("failed_precondition notes include IT contact guidance", () => {
    expect(noteForAttempt("failed_precondition", "BASE_URL_NOT_CONFIGURED")).toContain(
      "Please contact your IT department."
    );
    expect(noteForAttempt("failed_precondition", "INVALID_QUIET_HOURS")).toContain(
      "Please contact your IT department."
    );
  });

  it("skipped_booking_confirmation note is admin-readable", () => {
    expect(noteForAttempt("skipped_booking_confirmation", "BOOKING_CONFIRMATION")).toContain(
      "booking confirmation"
    );
  });
});

