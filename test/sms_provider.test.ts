import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  GHLProvider,
  TwilioProvider,
  MockSMSProvider,
} from "../convex/sms_provider";
import {
  createProviderFromConfig,
  getDefaultProvider,
} from "../convex/sms_factory";

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Save original env and restore after each test. */
const envSnapshot: Record<string, string | undefined> = {};
function saveEnv(...keys: string[]) {
  for (const k of keys) envSnapshot[k] = process.env[k];
}
function restoreEnv() {
  for (const [k, v] of Object.entries(envSnapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  saveEnv(
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER", "TWILIO_MESSAGING_SERVICE_SID",
    "GHL_SMS_WEBHOOK_URL",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

// ─── GHLProvider ──────────────────────────────────────────────────────────────

describe("GHLProvider", () => {
  it("sends SMS successfully and returns success: true", async () => {
    mockFetch((_url, _init) => new Response("OK", { status: 200 }));

    const provider = new GHLProvider("https://hooks.example.test/sms");
    const result = await provider.sendMessage({ to: "+15551234567", body: "Hello" });

    expect(result.success).toBe(true);
    expect(result.attemptCount).toBe(1);
    expect(result.httpStatus).toBe(200);

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://hooks.example.test/sms");
    expect(JSON.parse(fetchCall[1].body as string)).toEqual({
      phone: "+15551234567",
      message: "Hello",
    });
  });

  it("retries on 5xx and succeeds on retry", async () => {
    let call = 0;
    mockFetch(() => {
      call++;
      if (call === 1) return new Response("Server Error", { status: 500 });
      return new Response("OK", { status: 200 });
    });

    const provider = new GHLProvider("https://hooks.example.test/sms");
    const result = await provider.sendMessage({ to: "+15551234567", body: "Hi" });

    expect(result.success).toBe(true);
    expect(result.attemptCount).toBe(2);
  });

  it("fails with HTTP_ERROR on 4xx without retrying", async () => {
    mockFetch(() => new Response("Bad Request", { status: 400 }));

    const provider = new GHLProvider("https://hooks.example.test/sms");
    const result = await provider.sendMessage({ to: "+15551234567", body: "Hi" });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("HTTP_ERROR");
    expect(result.attemptCount).toBe(1);
    expect(result.httpStatus).toBe(400);
  });
});

// ─── TwilioProvider ───────────────────────────────────────────────────────────

describe("TwilioProvider", () => {
  const twilioConfig = {
    accountSid: "ACtest123",
    authToken: "auth-token-456",
    fromNumber: "+15559990000",
  };

  it("sends via Twilio REST API with correct auth and form body", async () => {
    mockFetch((_url, _init) => jsonResponse({ sid: "SM123abc" }));

    const provider = new TwilioProvider(twilioConfig);
    const result = await provider.sendMessage({ to: "+15551234567", body: "Reminder" });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("SM123abc");
    expect(result.httpStatus).toBe(200);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/Accounts/ACtest123/Messages.json");
    expect(init.headers.Authorization).toContain("Basic ");

    // Verify form body
    const body = new URLSearchParams(init.body as string);
    expect(body.get("To")).toBe("+15551234567");
    expect(body.get("Body")).toBe("Reminder");
    expect(body.get("From")).toBe("+15559990000");
  });

  it("uses MessagingServiceSid when configured", async () => {
    mockFetch(() => jsonResponse({ sid: "SM789" }));

    const provider = new TwilioProvider({
      accountSid: "ACtest",
      authToken: "tok",
      messagingServiceSid: "MG_SVC_123",
    });
    const result = await provider.sendMessage({ to: "+15551234567", body: "Hi" });

    expect(result.success).toBe(true);

    const body = new URLSearchParams((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.get("MessagingServiceSid")).toBe("MG_SVC_123");
    expect(body.get("From")).toBeNull();
  });

  it("returns RATE_LIMITED on 429 response", async () => {
    mockFetch(() => jsonResponse({ message: "Too many requests" }, 429));

    const provider = new TwilioProvider(twilioConfig);
    const result = await provider.sendMessage({ to: "+15551234567", body: "Hi" });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("RATE_LIMITED");
    expect(result.httpStatus).toBe(429);
  });
});

// ─── MockSMSProvider ──────────────────────────────────────────────────────────

describe("MockSMSProvider", () => {
  it("returns success without calling fetch", async () => {
    const fetchSpy = vi.stubGlobal("fetch", vi.fn());

    const provider = new MockSMSProvider();
    const result = await provider.sendMessage({ to: "+15551234567", body: "Test" });

    expect(result.success).toBe(true);
    expect(result.attemptCount).toBe(1);
    expect((fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

// ─── createProviderFromConfig ─────────────────────────────────────────────────

describe("createProviderFromConfig", () => {
  it("returns null when isEnabled is false", () => {
    const provider = createProviderFromConfig({
      provider: "ghl",
      isEnabled: false,
      webhookUrl: "https://hooks.example.test",
    });
    expect(provider).toBeNull();
  });

  it("returns a GHLProvider when provider is 'ghl' with a webhookUrl", () => {
    const provider = createProviderFromConfig({
      provider: "ghl",
      isEnabled: true,
      webhookUrl: "https://hooks.example.test/sms",
    });
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe("ghl");
  });

  it("returns a TwilioProvider when provider is 'twilio' with env vars set", () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+15559990000";

    const provider = createProviderFromConfig({
      provider: "twilio",
      isEnabled: true,
    });
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe("twilio");
  });
});

// ─── getDefaultProvider ───────────────────────────────────────────────────────

describe("getDefaultProvider", () => {
  it("returns TwilioProvider when Twilio env vars are set", () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+15559990000";
    delete process.env.GHL_SMS_WEBHOOK_URL;

    const provider = getDefaultProvider();
    expect(provider.name).toBe("twilio");
  });

  it("returns MockSMSProvider when no env vars are set", () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    delete process.env.GHL_SMS_WEBHOOK_URL;

    const provider = getDefaultProvider();
    expect(provider.name).toBe("mock");
  });
});
