import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  formatAppointmentDateTime,
  formatScheduleMessage,
  formatCancelMessage,
  formatReminder24hMessage,
  formatReminder1hMessage,
  sendSMSWebhook,
} from "../convex/webhook_utils";

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
});


