import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  formatAppointmentDateTime,
  formatScheduleMessage,
  formatCancelMessage,
  formatReminder24hMessage,
  formatReminder1hMessage,
  sendSMSWebhook,
  sendSMSWebhookDetailed,
  type SMSFailureContext,
} from "../convex/webhook_utils";
import * as smsFailureAlerts from "../convex/sms_failure_alerts";

const APPT_ID = "ap_123" as any;
const BASE_URL = "http://localhost:3000";
const TZ = "UTC";
const ADDRESS = "123 Test St";

describe("convex/webhook_utils (formatters)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formatAppointmentDateTime returns stable strings in UTC", () => {
    const d = new Date(Date.UTC(2026, 0, 10, 14, 30, 0)); // Jan 10 2026 14:30 UTC
    const { appointmentDateStr, appointmentTimeStr, appointmentDateTimeStr } =
      formatAppointmentDateTime(d, TZ);

    expect(appointmentDateStr).toContain("2026");
    expect(appointmentTimeStr).toMatch(/2:30\s?(PM|pm)/);
    expect(appointmentDateTimeStr).toMatch(/01-10-2026 02:30 (PM|pm)/);
  });

  it("formatScheduleMessage includes patient links and bilingual header", () => {
    const d = new Date(Date.UTC(2026, 0, 10, 14, 30, 0));
    const msg = formatScheduleMessage(
      "Alex",
      d,
      APPT_ID,
      BASE_URL,
      TZ,
      ADDRESS
    );

    expect(msg).toContain("Hi Alex");
    expect(msg).toContain("Hola Alex");
    expect(msg).toContain(ADDRESS);
    expect(msg).toContain(`${BASE_URL}/15-late/${APPT_ID}`);
    expect(msg).toContain(`${BASE_URL}/30-late/${APPT_ID}`);
    expect(msg).toContain(`${BASE_URL}/reschedule-cancel/${APPT_ID}`);
  });

  it("formatCancelMessage includes address and bilingual header", () => {
    const d = new Date(Date.UTC(2026, 0, 10, 14, 30, 0));
    const msg = formatCancelMessage("Alex", d, TZ, ADDRESS);

    expect(msg).toContain("Hi Alex");
    expect(msg).toContain("Hola Alex");
    expect(msg).toContain(ADDRESS);
    expect(msg).toContain("canceled");
    expect(msg).toContain("cancelada");
  });

  it("formatReminder24hMessage uses relative day labels when appointment is tomorrow (UTC)", () => {
    // Freeze "now" to Jan 10 2026 10:00 UTC
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 10, 0, 0)));

    // Appointment tomorrow Jan 11 2026 10:00 UTC
    const appointment = new Date(Date.UTC(2026, 0, 11, 10, 0, 0));

    const msg = formatReminder24hMessage(
      "Alex",
      appointment,
      APPT_ID,
      BASE_URL,
      TZ,
      ADDRESS
    );

    expect(msg.toLowerCase()).toContain("tomorrow");
    // Spanish "mañana" might be normalized differently, so check without accents too.
    expect(msg.toLowerCase()).toMatch(/ma(n|ñ)ana/);
    expect(msg).toContain(`${BASE_URL}/15-late/${APPT_ID}`);
  });

  it("formatReminder1hMessage includes links and bilingual header", () => {
    const appointment = new Date(Date.UTC(2026, 0, 10, 11, 0, 0));
    const msg = formatReminder1hMessage(
      "Alex",
      appointment,
      APPT_ID,
      BASE_URL,
      TZ,
      ADDRESS
    );

    expect(msg).toContain("Hi Alex");
    expect(msg).toContain("Hola Alex");
    expect(msg).toContain(`${BASE_URL}/30-late/${APPT_ID}`);
  });
});

describe("convex/webhook_utils (sendSMSWebhook)", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns false and does not call fetch when GHL_SMS_WEBHOOK_URL is not set", async () => {
    delete process.env.GHL_SMS_WEBHOOK_URL;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    const ok = await sendSMSWebhook("+15551234567", "hello");

    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs JSON payload and returns true when webhook responds ok", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";

    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      // Verify payload shape
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      expect(body).toEqual({ phone: "+15551234567", message: "hello" });
      return new Response(null, { status: 200 });
    });
    globalThis.fetch = fetchSpy as any;

    const ok = await sendSMSWebhook("+15551234567", "hello");

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx server errors and succeeds on retry", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";
    vi.useFakeTimers();

    let callCount = 0;
    const fetchSpy = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        return new Response(null, { status: 503 }); // Service unavailable
      }
      return new Response(null, { status: 200 }); // Success on 3rd attempt
    });
    globalThis.fetch = fetchSpy as any;

    const promise = sendSMSWebhook("+15551234567", "hello");
    
    // Fast-forward through backoff delays
    await vi.runAllTimersAsync();
    
    const ok = await promise;

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries

    vi.useRealTimers();
  });

  it("retries on 429 rate limit and succeeds on retry", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";
    vi.useFakeTimers();

    let callCount = 0;
    const fetchSpy = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(null, { status: 429 }); // Rate limited
      }
      return new Response(null, { status: 200 }); // Success on 2nd attempt
    });
    globalThis.fetch = fetchSpy as any;

    const promise = sendSMSWebhook("+15551234567", "hello");
    await vi.runAllTimersAsync();
    const ok = await promise;

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("does NOT retry on 4xx client errors (except 429)", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";

    const fetchSpy = vi.fn(async () => {
      return new Response(null, { status: 400 }); // Bad request - not retryable
    });
    globalThis.fetch = fetchSpy as any;

    const ok = await sendSMSWebhook("+15551234567", "hello");

    expect(ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // No retries
  });

  it("retries on network errors and fails after max retries", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";
    vi.useFakeTimers();

    const fetchSpy = vi.fn(async () => {
      throw new Error("Network error");
    });
    globalThis.fetch = fetchSpy as any;

    const promise = sendSMSWebhook("+15551234567", "hello");
    await vi.runAllTimersAsync();
    const ok = await promise;

    expect(ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(4); // 1 initial + 3 retries

    vi.useRealTimers();
  });

  it("retries on timeout and succeeds on retry", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";
    vi.useFakeTimers();

    let callCount = 0;
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // Simulate timeout by aborting
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      }
      return new Response(null, { status: 200 });
    });
    globalThis.fetch = fetchSpy as any;

    const promise = sendSMSWebhook("+15551234567", "hello");
    await vi.runAllTimersAsync();
    const ok = await promise;

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe("convex/webhook_utils (SMS failure alerts)", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls notifySmsFailure when webhook fails with HTTP error", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";

    const notifySpy = vi.spyOn(smsFailureAlerts, "notifySmsFailure").mockResolvedValue();
    const fetchSpy = vi.fn(async () => new Response(null, { status: 400 }));
    globalThis.fetch = fetchSpy as any;

    const context: SMSFailureContext = {
      type: "reminder_24h",
      appointmentId: "appt123" as any,
      description: "Test reminder",
    };

    const result = await sendSMSWebhookDetailed("+15551234567", "hello", context);

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("HTTP_NON_RETRYABLE");
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith({
      phone: "+15551234567",
      message: "hello",
      context,
      webhookResult: result,
    });
  });

  it("calls notifySmsFailure when webhook fails after retries exhausted", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";
    vi.useFakeTimers();

    const notifySpy = vi.spyOn(smsFailureAlerts, "notifySmsFailure").mockResolvedValue();
    const fetchSpy = vi.fn(async () => new Response(null, { status: 503 }));
    globalThis.fetch = fetchSpy as any;

    const context: SMSFailureContext = {
      type: "schedule",
      appointmentId: "appt456" as any,
      patientId: "patient789" as any,
      description: "Schedule confirmation",
    };

    const promise = sendSMSWebhookDetailed("+15551234567", "hello", context);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("HTTP_RETRY_EXHAUSTED");
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+15551234567",
        message: "hello",
        context,
      })
    );

    vi.useRealTimers();
  });

  it("does NOT call notifySmsFailure when webhook succeeds", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";

    const notifySpy = vi.spyOn(smsFailureAlerts, "notifySmsFailure").mockResolvedValue();
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchSpy as any;

    const result = await sendSMSWebhookDetailed("+15551234567", "hello", {
      type: "cancel",
      description: "Test cancel",
    });

    expect(result.ok).toBe(true);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("does NOT call notifySmsFailure when webhook URL is not configured", async () => {
    delete process.env.GHL_SMS_WEBHOOK_URL;

    const notifySpy = vi.spyOn(smsFailureAlerts, "notifySmsFailure").mockResolvedValue();

    const result = await sendSMSWebhookDetailed("+15551234567", "hello", {
      type: "generic",
    });

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("WEBHOOK_URL_NOT_CONFIGURED");
    // Should NOT alert for config issues
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("does not throw when notifySmsFailure fails", async () => {
    process.env.GHL_SMS_WEBHOOK_URL = "http://example.test/webhook";

    const notifySpy = vi
      .spyOn(smsFailureAlerts, "notifySmsFailure")
      .mockRejectedValue(new Error("Email send failed"));
    const fetchSpy = vi.fn(async () => new Response(null, { status: 400 }));
    globalThis.fetch = fetchSpy as any;

    // Should not throw even if alert fails
    const result = await sendSMSWebhookDetailed("+15551234567", "hello");

    expect(result.ok).toBe(false);
    expect(notifySpy).toHaveBeenCalled();
  });
});


