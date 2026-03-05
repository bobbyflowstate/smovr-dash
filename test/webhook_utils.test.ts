import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  formatAppointmentDateTime,
  formatScheduleMessage,
  formatCancelMessage,
  formatReminder24hMessage,
  formatReminder1hMessage,
  formatBirthdayMessage,
  formatReturnDateMessage,
  formatReferralFollowUpMessage,
  formatReactivationMessage,
  formatWebsiteEntryMessage,
  formatBookingConfirmationMessage,
  sendSMSWebhook,
  resolveMessages,
  getSchedulingLink,
  LOCALES,
  type ResolvedMessages,
  type SchedulingLinkTeam,
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

describe("convex/webhook_utils (formatters – English only)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formatScheduleMessage in EN mode omits all Spanish text", () => {
    const d = new Date(Date.UTC(2026, 0, 10, 14, 30, 0));
    const msg = formatScheduleMessage("Alex", d, APPT_ID, BASE_URL, TZ, ADDRESS, "en");

    expect(msg).toContain("Hi Alex");
    expect(msg).not.toContain("Hola");
    expect(msg).toContain("Date & Time:");
    expect(msg).not.toContain("Fecha y hora");
    expect(msg).toContain("Address:");
    expect(msg).not.toContain("Dirección");
    expect(msg).not.toContain("Infórmenos");
    expect(msg).not.toContain("minutos tarde");
    expect(msg).not.toContain("Necesita reprogramar");
    expect(msg).toContain(`${BASE_URL}/15-late/${APPT_ID}`);
  });

  it("formatCancelMessage in EN mode omits Spanish text", () => {
    const d = new Date(Date.UTC(2026, 0, 10, 14, 30, 0));
    const msg = formatCancelMessage("Alex", d, TZ, ADDRESS, "en");

    expect(msg).toContain("Hi Alex");
    expect(msg).not.toContain("Hola");
    expect(msg).toContain("canceled");
    expect(msg).not.toContain("cancelada");
    expect(msg).not.toContain("Dirección");
    expect(msg).toContain("If you need to reschedule");
    expect(msg).not.toContain("Si necesita reprogramar");
  });

  it("formatReminder24hMessage in EN mode omits Spanish text", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 10, 10, 0, 0)));
    const appointment = new Date(Date.UTC(2026, 0, 11, 10, 0, 0));
    const msg = formatReminder24hMessage("Alex", appointment, APPT_ID, BASE_URL, TZ, ADDRESS, "en");

    expect(msg).toContain("Hi Alex");
    expect(msg.toLowerCase()).toContain("tomorrow");
    expect(msg).not.toContain("Hola");
    expect(msg).not.toMatch(/ma[nñ]ana/i);
    expect(msg).not.toContain("Dirección");
    expect(msg).not.toContain("Infórmenos");
    expect(msg).toContain(`${BASE_URL}/reschedule-cancel/${APPT_ID}`);
  });

  it("formatReminder1hMessage in EN mode omits Spanish text", () => {
    const appointment = new Date(Date.UTC(2026, 0, 10, 11, 0, 0));
    const msg = formatReminder1hMessage("Alex", appointment, APPT_ID, BASE_URL, TZ, ADDRESS, "en");

    expect(msg).toContain("Hi Alex");
    expect(msg).toContain("about 1 hour");
    expect(msg).not.toContain("Hola");
    expect(msg).not.toContain("aproximadamente");
    expect(msg).not.toContain("Dirección");
    expect(msg).not.toContain("Infórmenos");
    expect(msg).toContain(`${BASE_URL}/30-late/${APPT_ID}`);
  });

  it("formatScheduleMessage default (no languageMode arg) is bilingual", () => {
    const d = new Date(Date.UTC(2026, 0, 10, 14, 30, 0));
    const msg = formatScheduleMessage("Alex", d, APPT_ID, BASE_URL, TZ, ADDRESS);

    expect(msg).toContain("Hi Alex");
    expect(msg).toContain("Hola Alex");
    expect(msg).toContain("Fecha y hora");
  });
});

describe("LOCALES registry", () => {
  it("has en and es locales registered", () => {
    expect(LOCALES).toHaveProperty("en");
    expect(LOCALES).toHaveProperty("es");
  });

  it("every locale has all required label keys", () => {
    const labelKeys = [
      "dateTime", "address", "statusPrompt",
      "late15", "late30", "rescheduleOption", "rescheduleContactNote",
    ];
    for (const [code, locale] of Object.entries(LOCALES)) {
      for (const key of labelKeys) {
        expect(typeof (locale as any)[key]).toBe("string");
      }
    }
  });

  it("every locale has all required greeting functions", () => {
    const greetingKeys = [
      "scheduleConfirmed", "appointmentCanceled",
      "reminder24hTomorrow", "reminder24hToday", "reminder24hUpcoming",
      "reminder1h",
    ];
    for (const [code, locale] of Object.entries(LOCALES)) {
      for (const key of greetingKeys) {
        expect(typeof (locale as any)[key]).toBe("function");
        const withName = (locale as any)[key]("Test");
        const withoutName = (locale as any)[key](null);
        expect(typeof withName).toBe("string");
        expect(withName.length).toBeGreaterThan(0);
        expect(typeof withoutName).toBe("string");
        expect(withoutName.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("resolveMessages", () => {
  it("single locale (en) produces labels without ' / ' separator", () => {
    const m = resolveMessages("en");
    expect(m.dateTimeLabel).toBe("Date & Time:");
    expect(m.addressLabel).toBe("Address:");
    expect(m.statusPromptLabel).toBe("Let us know if you are:");
    expect(m.late15Label).toBe("• 15 mins late:");
    expect(m.late30Label).toBe("• 30 mins late:");
    expect(m.rescheduleOptionLabel).toBe("• Need to reschedule:");
    expect(m.rescheduleContactNote).toBe("If you need to reschedule, please contact us.");
  });

  it("bilingual mode (en_es) joins labels with ' / ' separator", () => {
    const m = resolveMessages("en_es");
    expect(m.dateTimeLabel).toBe("Date & Time / Fecha y hora:");
    expect(m.addressLabel).toBe("Address / Dirección:");
    expect(m.statusPromptLabel).toBe("Let us know if you are / Infórmenos si usted:");
    expect(m.late15Label).toBe("• 15 mins late / 15 minutos tarde:");
    expect(m.late30Label).toBe("• 30 mins late / 30 minutos tarde:");
    expect(m.rescheduleOptionLabel).toBe("• Need to reschedule / Necesita reprogramar:");
  });

  it("bilingual mode joins greetings with newline", () => {
    const m = resolveMessages("en_es");
    const greeting = m.scheduleConfirmed("Alex");
    expect(greeting).toContain("Hi Alex");
    expect(greeting).toContain("Hola Alex");
    expect(greeting).toMatch(/Hi Alex[^\n]*\nHola Alex/);
  });

  it("bilingual mode joins rescheduleContactNote with newline", () => {
    const m = resolveMessages("en_es");
    expect(m.rescheduleContactNote).toBe(
      "If you need to reschedule, please contact us.\n" +
      "Si necesita reprogramar, por favor contáctenos."
    );
  });

  it("single locale greetings produce only that locale's text", () => {
    const m = resolveMessages("en");
    const greeting = m.scheduleConfirmed("Alex");
    expect(greeting).toBe("Hi Alex, your appointment is confirmed.");
    expect(greeting).not.toContain("\n");
  });

  it("greeting functions handle null name", () => {
    const en = resolveMessages("en");
    expect(en.scheduleConfirmed(null)).toBe("Your appointment is confirmed.");

    const enEs = resolveMessages("en_es");
    const bilingual = enEs.appointmentCanceled(null);
    expect(bilingual).toContain("Your appointment has been canceled.");
    expect(bilingual).toContain("Su cita ha sido cancelada.");
  });

  it("throws on unknown locale code", () => {
    expect(() => resolveMessages("xx" as any)).toThrow("Unknown locale code: xx");
    expect(() => resolveMessages("en_xx" as any)).toThrow("Unknown locale code: xx");
  });

  it("all greeting keys are present on the resolved object", () => {
    const greetingKeys = [
      "scheduleConfirmed", "appointmentCanceled",
      "reminder24hTomorrow", "reminder24hToday", "reminder24hUpcoming",
      "reminder1h",
    ];
    const m = resolveMessages("en");
    for (const key of greetingKeys) {
      expect(typeof (m as any)[key]).toBe("function");
    }
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

  it("falls back to mock provider (returns true) when no SMS env vars are set", async () => {
    delete process.env.GHL_SMS_WEBHOOK_URL;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    const ok = await sendSMSWebhook("+15551234567", "hello");

    // Mock provider reports success (but logs a warning)
    expect(ok).toBe(true);
    // Mock provider does not call fetch
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

// ---------------------------------------------------------------------------
// getSchedulingLink
// ---------------------------------------------------------------------------

describe("getSchedulingLink", () => {
  const baseUrl = "https://app.smovr.com";

  it("returns rescheduleUrl when set (full override)", () => {
    const team: SchedulingLinkTeam = {
      rescheduleUrl: "https://external.clinic.com/schedule",
      entrySlug: "acme-dental",
    };
    expect(getSchedulingLink(team, baseUrl)).toBe("https://external.clinic.com/schedule");
  });

  it("falls back to /book/[entrySlug] when no rescheduleUrl", () => {
    const team: SchedulingLinkTeam = { entrySlug: "acme-dental" };
    expect(getSchedulingLink(team, baseUrl)).toBe("https://app.smovr.com/book/acme-dental");
  });

  it("returns null when neither is configured", () => {
    expect(getSchedulingLink({}, baseUrl)).toBeNull();
  });

  it("returns null for null/undefined team", () => {
    expect(getSchedulingLink(null, baseUrl)).toBeNull();
    expect(getSchedulingLink(undefined, baseUrl)).toBeNull();
  });

  it("rescheduleUrl takes priority over entrySlug", () => {
    const team: SchedulingLinkTeam = {
      rescheduleUrl: "https://external.com/book",
      entrySlug: "slug",
    };
    expect(getSchedulingLink(team, baseUrl)).toBe("https://external.com/book");
  });
});

// ---------------------------------------------------------------------------
// schedulingLink parameter in formatters
// ---------------------------------------------------------------------------

describe("formatters respect schedulingLink override", () => {
  const date = new Date("2026-04-15T14:30:00Z");
  const externalLink = "https://external.clinic.com/schedule";

  it("formatScheduleMessage uses schedulingLink when provided", () => {
    const msg = formatScheduleMessage("Jane", date, APPT_ID, BASE_URL, TZ, ADDRESS, "en", externalLink);
    expect(msg).toContain(externalLink);
    expect(msg).not.toContain("/reschedule-cancel/");
  });

  it("formatScheduleMessage falls back to /reschedule-cancel when schedulingLink is null", () => {
    const msg = formatScheduleMessage("Jane", date, APPT_ID, BASE_URL, TZ, ADDRESS, "en", null);
    expect(msg).toContain(`${BASE_URL}/reschedule-cancel/${APPT_ID}`);
    expect(msg).not.toContain("external");
  });

  it("formatScheduleMessage falls back when schedulingLink is omitted", () => {
    const msg = formatScheduleMessage("Jane", date, APPT_ID, BASE_URL, TZ, ADDRESS, "en");
    expect(msg).toContain(`${BASE_URL}/reschedule-cancel/${APPT_ID}`);
  });

  it("formatReminder24hMessage uses schedulingLink when provided", () => {
    const msg = formatReminder24hMessage("Jane", date, APPT_ID, BASE_URL, TZ, ADDRESS, "en", externalLink);
    expect(msg).toContain(externalLink);
    expect(msg).not.toContain("/reschedule-cancel/");
  });

  it("formatReminder1hMessage uses schedulingLink when provided", () => {
    const msg = formatReminder1hMessage("Jane", date, APPT_ID, BASE_URL, TZ, ADDRESS, "en", externalLink);
    expect(msg).toContain(externalLink);
    expect(msg).not.toContain("/reschedule-cancel/");
  });

  it("late links are always appointment-specific regardless of schedulingLink", () => {
    const msg = formatScheduleMessage("Jane", date, APPT_ID, BASE_URL, TZ, ADDRESS, "en", externalLink);
    expect(msg).toContain(`${BASE_URL}/15-late/${APPT_ID}`);
    expect(msg).toContain(`${BASE_URL}/30-late/${APPT_ID}`);
  });
});

// ---------------------------------------------------------------------------
// formatBirthdayMessage
// ---------------------------------------------------------------------------

describe("formatBirthdayMessage", () => {
  it("English-only with patient name", () => {
    const msg = formatBirthdayMessage("Maria", "en");
    expect(msg).toContain("Maria");
    expect(msg).toContain("happy birthday");
    expect(msg).not.toContain("cumpleaños");
  });

  it("English-only without patient name", () => {
    const msg = formatBirthdayMessage(null, "en");
    expect(msg).toContain("Happy birthday");
    expect(msg).not.toContain("null");
  });

  it("bilingual with patient name", () => {
    const msg = formatBirthdayMessage("Maria", "en_es");
    expect(msg).toContain("Maria");
    expect(msg).toContain("happy birthday");
    expect(msg).toContain("cumpleaños");
  });

  it("bilingual without patient name", () => {
    const msg = formatBirthdayMessage(null, "en_es");
    expect(msg).toContain("Happy birthday");
    expect(msg).toContain("cumpleaños");
    expect(msg).not.toContain("null");
  });

  it("defaults to bilingual when languageMode is omitted", () => {
    const msg = formatBirthdayMessage("Alex");
    expect(msg).toContain("happy birthday");
    expect(msg).toContain("cumpleaños");
  });
});

describe("formatReturnDateMessage", () => {
  const LINK = "https://app.smovr.com/book/test-clinic";

  it("English-only with patient name", () => {
    const msg = formatReturnDateMessage("John", LINK, "en");
    expect(msg).toContain("John");
    expect(msg).toContain("schedule");
    expect(msg).toContain(LINK);
    expect(msg).not.toContain("programar");
  });

  it("English-only without patient name", () => {
    const msg = formatReturnDateMessage(null, LINK, "en");
    expect(msg).toContain("schedule");
    expect(msg).toContain(LINK);
    expect(msg).not.toContain("null");
  });

  it("bilingual with patient name", () => {
    const msg = formatReturnDateMessage("John", LINK, "en_es");
    expect(msg).toContain("John");
    expect(msg).toContain("schedule");
    expect(msg).toContain("programar");
    expect(msg).toContain(LINK);
  });

  it("bilingual without patient name", () => {
    const msg = formatReturnDateMessage(null, LINK, "en_es");
    expect(msg).toContain("schedule");
    expect(msg).toContain("programar");
    expect(msg).not.toContain("null");
  });

  it("defaults to bilingual", () => {
    const msg = formatReturnDateMessage("Alex", LINK);
    expect(msg).toContain("schedule");
    expect(msg).toContain("programar");
  });

  it("appends scheduling link on its own line", () => {
    const msg = formatReturnDateMessage("Alex", LINK, "en");
    const lines = msg.split("\n");
    expect(lines[lines.length - 1]).toBe(LINK);
  });
});

// ---------------------------------------------------------------------------
// birthdayGreeting in locale registry
// ---------------------------------------------------------------------------

describe("LOCALES birthdayGreeting", () => {
  it("en locale has birthdayGreeting function", () => {
    expect(typeof LOCALES.en.birthdayGreeting).toBe("function");
    expect(LOCALES.en.birthdayGreeting("Test")).toBeTruthy();
    expect(LOCALES.en.birthdayGreeting(null)).toBeTruthy();
  });

  it("es locale has birthdayGreeting function", () => {
    expect(typeof LOCALES.es.birthdayGreeting).toBe("function");
    expect(LOCALES.es.birthdayGreeting("Test")).toContain("cumpleaños");
    expect(LOCALES.es.birthdayGreeting(null)).toContain("cumpleaños");
  });

  it("resolveMessages includes birthdayGreeting for single locale", () => {
    const m = resolveMessages("en");
    expect(typeof m.birthdayGreeting).toBe("function");
    const msg = m.birthdayGreeting("Sam");
    expect(msg).toContain("Sam");
    expect(msg).not.toContain("\n");
  });

  it("resolveMessages joins birthdayGreeting with newline for bilingual", () => {
    const m = resolveMessages("en_es");
    const msg = m.birthdayGreeting("Sam");
    expect(msg).toContain("\n");
    expect(msg).toContain("Sam");
    expect(msg).toContain("cumpleaños");
  });

  // -------------------------------------------------------------------------
  // returnDateReminder locale & formatter tests
  // -------------------------------------------------------------------------

  it("en locale includes returnDateReminder function", () => {
    const en = LOCALES["en"];
    expect(typeof en.returnDateReminder).toBe("function");
    const msg = en.returnDateReminder("Alice");
    expect(msg).toContain("Alice");
    expect(msg).toContain("schedule");
  });

  it("es locale includes returnDateReminder function", () => {
    const es = LOCALES["es"];
    expect(typeof es.returnDateReminder).toBe("function");
    const msg = es.returnDateReminder("Alice");
    expect(msg).toContain("Alice");
    expect(msg).toContain("programar");
  });

  it("returnDateReminder handles null name in en", () => {
    const en = LOCALES["en"];
    const msg = en.returnDateReminder(null);
    expect(msg).not.toContain("null");
    expect(msg).toContain("schedule");
  });

  it("resolveMessages includes returnDateReminder for single locale", () => {
    const m = resolveMessages("en");
    expect(typeof m.returnDateReminder).toBe("function");
    const msg = m.returnDateReminder("Pat");
    expect(msg).toContain("Pat");
    expect(msg).not.toContain("\n");
  });

  it("resolveMessages joins returnDateReminder for bilingual", () => {
    const m = resolveMessages("en_es");
    const msg = m.returnDateReminder("Pat");
    expect(msg).toContain("\n");
    expect(msg).toContain("Pat");
    expect(msg).toContain("programar");
  });

  // -------------------------------------------------------------------------
  // referralFollowUp locale & formatter tests
  // -------------------------------------------------------------------------

  it("en locale includes referralFollowUp function", () => {
    const en = LOCALES["en"];
    expect(typeof en.referralFollowUp).toBe("function");
    const msg = en.referralFollowUp("Lisa");
    expect(msg).toContain("Lisa");
    expect(msg).toContain("checking in");
  });

  it("es locale includes referralFollowUp function", () => {
    const es = LOCALES["es"];
    expect(typeof es.referralFollowUp).toBe("function");
    const msg = es.referralFollowUp("Lisa");
    expect(msg).toContain("Lisa");
    expect(msg).toContain("verificar");
  });

  it("referralFollowUp handles null name in en", () => {
    const en = LOCALES["en"];
    const msg = en.referralFollowUp(null);
    expect(msg).not.toContain("null");
    expect(msg).toContain("checking in");
  });

  it("resolveMessages includes referralFollowUp for single locale", () => {
    const m = resolveMessages("en");
    expect(typeof m.referralFollowUp).toBe("function");
    const msg = m.referralFollowUp("Kim");
    expect(msg).toContain("Kim");
    expect(msg).not.toContain("\n");
  });

  it("resolveMessages joins referralFollowUp for bilingual", () => {
    const m = resolveMessages("en_es");
    const msg = m.referralFollowUp("Kim");
    expect(msg).toContain("\n");
    expect(msg).toContain("Kim");
    expect(msg).toContain("verificar");
  });
});

describe("formatReferralFollowUpMessage", () => {
  const LINK = "https://app.smovr.com/referral-status/abc123xyz";

  it("English-only with patient name", () => {
    const msg = formatReferralFollowUpMessage("Maria", LINK, "en");
    expect(msg).toContain("Maria");
    expect(msg).toContain("checking in");
    expect(msg).toContain(LINK);
    expect(msg).not.toContain("verificar");
  });

  it("English-only without patient name", () => {
    const msg = formatReferralFollowUpMessage(null, LINK, "en");
    expect(msg).toContain("checking in");
    expect(msg).toContain(LINK);
    expect(msg).not.toContain("null");
  });

  it("bilingual with patient name", () => {
    const msg = formatReferralFollowUpMessage("Maria", LINK, "en_es");
    expect(msg).toContain("Maria");
    expect(msg).toContain("checking in");
    expect(msg).toContain("verificar");
    expect(msg).toContain(LINK);
  });

  it("bilingual without patient name", () => {
    const msg = formatReferralFollowUpMessage(null, LINK, "en_es");
    expect(msg).toContain("checking in");
    expect(msg).toContain("verificar");
    expect(msg).not.toContain("null");
  });

  it("defaults to bilingual", () => {
    const msg = formatReferralFollowUpMessage("Alex", LINK);
    expect(msg).toContain("checking in");
    expect(msg).toContain("verificar");
  });

  it("appends status link on its own line", () => {
    const msg = formatReferralFollowUpMessage("Alex", LINK, "en");
    const lines = msg.split("\n");
    expect(lines[lines.length - 1]).toBe(LINK);
  });

  it("does NOT contain referral details (HIPAA safe)", () => {
    const msg = formatReferralFollowUpMessage("Alex", LINK, "en_es");
    expect(msg).not.toContain("Dr.");
    expect(msg).not.toContain("address");
    expect(msg).not.toContain("phone");
    expect(msg).not.toContain("specialist");
  });
});

// ---------------------------------------------------------------------------
// formatReactivationMessage tests
// ---------------------------------------------------------------------------

describe("formatReactivationMessage", () => {
  const LINK = "https://app.smovr.com/book/test-clinic";

  it("English-only with patient name", () => {
    const msg = formatReactivationMessage("Sarah", LINK, "en");
    expect(msg).toContain("Sarah");
    expect(msg).toContain("not seen you in a while");
    expect(msg).toContain(LINK);
    expect(msg).not.toContain("tiempo");
  });

  it("English-only without patient name", () => {
    const msg = formatReactivationMessage(null, LINK, "en");
    expect(msg).toContain("not seen you in a while");
    expect(msg).toContain(LINK);
    expect(msg).not.toContain("null");
  });

  it("bilingual with patient name", () => {
    const msg = formatReactivationMessage("Sarah", LINK, "en_es");
    expect(msg).toContain("Sarah");
    expect(msg).toContain("not seen you in a while");
    expect(msg).toContain("tiempo");
    expect(msg).toContain(LINK);
  });

  it("bilingual without patient name", () => {
    const msg = formatReactivationMessage(null, LINK, "en_es");
    expect(msg).toContain("not seen you in a while");
    expect(msg).toContain("tiempo");
    expect(msg).not.toContain("null");
  });

  it("defaults to bilingual", () => {
    const msg = formatReactivationMessage("Tom", LINK);
    expect(msg).toContain("not seen you in a while");
    expect(msg).toContain("tiempo");
  });

  it("appends scheduling link on its own line", () => {
    const msg = formatReactivationMessage("Tom", LINK, "en");
    const lines = msg.split("\n");
    expect(lines[lines.length - 1]).toBe(LINK);
  });
});

// ---------------------------------------------------------------------------
// reactivation in locale registry
// ---------------------------------------------------------------------------

describe("reactivation in locale registry", () => {
  it("en locale includes reactivation function", () => {
    const en = LOCALES["en"];
    expect(typeof en.reactivation).toBe("function");
    const msg = en.reactivation("Dana");
    expect(msg).toContain("Dana");
    expect(msg).toContain("not seen you");
  });

  it("es locale includes reactivation function", () => {
    const es = LOCALES["es"];
    expect(typeof es.reactivation).toBe("function");
    const msg = es.reactivation("Dana");
    expect(msg).toContain("Dana");
    expect(msg).toContain("tiempo");
  });

  it("reactivation handles null name", () => {
    const en = LOCALES["en"];
    const msg = en.reactivation(null);
    expect(msg).not.toContain("null");
    expect(msg).toContain("not seen you");
  });

  it("resolveMessages includes reactivation for single locale", () => {
    const m = resolveMessages("en");
    expect(typeof m.reactivation).toBe("function");
    const msg = m.reactivation("Jo");
    expect(msg).toContain("Jo");
    expect(msg).not.toContain("\n");
  });

  it("resolveMessages joins reactivation for bilingual", () => {
    const m = resolveMessages("en_es");
    const msg = m.reactivation("Jo");
    expect(msg).toContain("\n");
    expect(msg).toContain("Jo");
    expect(msg).toContain("tiempo");
  });
});

// =========================================================================
// formatWebsiteEntryMessage
// =========================================================================
describe("formatWebsiteEntryMessage", () => {
  it("returns English-only message with name when languageMode is 'en'", () => {
    const msg = formatWebsiteEntryMessage("Alice", "en");
    expect(msg).toContain("Alice");
    expect(msg).toContain("How can we help");
    expect(msg).not.toContain("\n");
    expect(msg).not.toContain("Cómo podemos");
  });

  it("returns bilingual message with name by default (en_es)", () => {
    const msg = formatWebsiteEntryMessage("Bob");
    expect(msg).toContain("Bob");
    expect(msg).toContain("How can we help");
    expect(msg).toContain("\n");
    expect(msg).toContain("Cómo podemos");
  });

  it("handles null name in English", () => {
    const msg = formatWebsiteEntryMessage(null, "en");
    expect(msg).not.toContain("null");
    expect(msg).toContain("Thanks for reaching out");
  });

  it("handles null name in bilingual", () => {
    const msg = formatWebsiteEntryMessage(null, "en_es");
    expect(msg).not.toContain("null");
    expect(msg).toContain("Thanks for reaching out");
    expect(msg).toContain("Gracias por comunicarse");
  });

  it("does not include a scheduling link", () => {
    const msg = formatWebsiteEntryMessage("Test", "en_es");
    expect(msg).not.toContain("http");
    expect(msg).not.toContain("/book/");
    expect(msg).not.toContain("/entry/");
  });
});

describe("websiteEntry locale entries", () => {
  it("en locale has websiteEntry function", () => {
    expect(typeof LOCALES["en"].websiteEntry).toBe("function");
    const msg = LOCALES["en"].websiteEntry("Dana");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("Dana");
  });

  it("es locale has websiteEntry function", () => {
    expect(typeof LOCALES["es"].websiteEntry).toBe("function");
    const msg = LOCALES["es"].websiteEntry("Carlos");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("Carlos");
    expect(msg).toContain("comunicarse");
  });

  it("websiteEntry handles null name in es", () => {
    const msg = LOCALES["es"].websiteEntry(null);
    expect(msg).not.toContain("null");
    expect(msg).toContain("Gracias");
  });

  it("resolveMessages includes websiteEntry for single locale", () => {
    const m = resolveMessages("en");
    expect(typeof m.websiteEntry).toBe("function");
    const msg = m.websiteEntry("Jen");
    expect(msg).toContain("Jen");
    expect(msg).not.toContain("\n");
  });

  it("resolveMessages joins websiteEntry for bilingual", () => {
    const m = resolveMessages("en_es");
    const msg = m.websiteEntry("Jen");
    expect(msg).toContain("\n");
    expect(msg).toContain("Jen");
    expect(msg).toContain("comunicarse");
  });
});

// =========================================================================
// formatBookingConfirmationMessage
// =========================================================================
describe("formatBookingConfirmationMessage", () => {
  it("returns English-only message with name when languageMode is 'en'", () => {
    const msg = formatBookingConfirmationMessage("Alice", "en");
    expect(msg).toContain("Alice");
    expect(msg).toContain("scheduling request");
    expect(msg).not.toContain("\n");
    expect(msg).not.toContain("solicitud de cita");
  });

  it("returns bilingual message with name by default (en_es)", () => {
    const msg = formatBookingConfirmationMessage("Bob");
    expect(msg).toContain("Bob");
    expect(msg).toContain("scheduling request");
    expect(msg).toContain("\n");
    expect(msg).toContain("solicitud de cita");
  });

  it("handles null name in English", () => {
    const msg = formatBookingConfirmationMessage(null, "en");
    expect(msg).not.toContain("null");
    expect(msg).toContain("Thank you for your scheduling request");
  });

  it("handles null name in bilingual", () => {
    const msg = formatBookingConfirmationMessage(null, "en_es");
    expect(msg).not.toContain("null");
    expect(msg).toContain("Thank you");
    expect(msg).toContain("Gracias por su solicitud");
  });
});

describe("bookingConfirmation locale entries", () => {
  it("en locale has bookingConfirmation function", () => {
    expect(typeof LOCALES["en"].bookingConfirmation).toBe("function");
    const msg = LOCALES["en"].bookingConfirmation("Dana");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("Dana");
  });

  it("es locale has bookingConfirmation function", () => {
    expect(typeof LOCALES["es"].bookingConfirmation).toBe("function");
    const msg = LOCALES["es"].bookingConfirmation("Carlos");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("Carlos");
    expect(msg).toContain("solicitud de cita");
  });

  it("resolveMessages includes bookingConfirmation for single locale", () => {
    const m = resolveMessages("en");
    expect(typeof m.bookingConfirmation).toBe("function");
    const msg = m.bookingConfirmation("Jen");
    expect(msg).toContain("Jen");
    expect(msg).not.toContain("\n");
  });

  it("resolveMessages joins bookingConfirmation for bilingual", () => {
    const m = resolveMessages("en_es");
    const msg = m.bookingConfirmation("Jen");
    expect(msg).toContain("\n");
    expect(msg).toContain("Jen");
    expect(msg).toContain("solicitud de cita");
  });
});
