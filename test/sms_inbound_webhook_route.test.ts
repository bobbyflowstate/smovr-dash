import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const parseInboundWebhookMock = vi.fn();
const verifySignatureMock = vi.fn();

const mockConvex = {
  query: vi.fn(),
  mutation: vi.fn(),
};

vi.mock("@/lib/convex-server", () => ({
  createAdminConvexClient: () => mockConvex,
}));

vi.mock("@/lib/observability", () => ({
  runWithContext: async (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
  createRequestContext: () => ({}),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  extendContext: vi.fn(),
}));

vi.mock("@/lib/sms", () => {
  class GHLProvider {
    constructor(_url: string) {}
    async verifyWebhookSignature(request: Request, secret: string) {
      return verifySignatureMock(request, secret);
    }
  }

  class TwilioProvider {
    constructor(_config: unknown) {}
    async verifyWebhookSignature(request: Request, secret: string) {
      return verifySignatureMock(request, secret);
    }
  }

  class MockSMSProvider {
    async verifyWebhookSignature(request: Request, secret: string) {
      return verifySignatureMock(request, secret);
    }
  }

  return {
    parseInboundWebhook: parseInboundWebhookMock,
    GHLProvider,
    TwilioProvider,
    MockSMSProvider,
  };
});

describe("POST /api/webhooks/sms-inbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseInboundWebhookMock.mockResolvedValue({
      phone: "+15551234567",
      body: "hello",
      receivedAt: new Date().toISOString(),
      providerMessageId: "msg-1",
    });
    verifySignatureMock.mockResolvedValue(true);
    mockConvex.query.mockResolvedValue({ inboundWebhookSecret: "secret-1" });
    mockConvex.mutation.mockResolvedValue({
      messageId: "m1",
      patientId: "p1",
    });
  });

  it("rejects unsupported provider 'vonage'", async () => {
    const { POST } = await import("../src/app/api/webhooks/sms-inbound/route");
    const request = new NextRequest(
      "http://localhost:3000/api/webhooks/sms-inbound?provider=vonage&team=team_1",
      { method: "POST", body: JSON.stringify({}) }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(parseInboundWebhookMock).not.toHaveBeenCalled();
  });

  it("requires configured webhook secret for non-mock providers", async () => {
    mockConvex.query.mockResolvedValue({ inboundWebhookSecret: undefined });

    const { POST } = await import("../src/app/api/webhooks/sms-inbound/route");
    const request = new NextRequest(
      "http://localhost:3000/api/webhooks/sms-inbound?provider=ghl&team=team_1",
      {
        method: "POST",
        body: JSON.stringify({ phone: "+15550001111", message: "hello" }),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(parseInboundWebhookMock).not.toHaveBeenCalled();
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("allows mock provider without webhook secret", async () => {
    mockConvex.query.mockResolvedValue({ inboundWebhookSecret: undefined });

    const { POST } = await import("../src/app/api/webhooks/sms-inbound/route");
    const request = new NextRequest(
      "http://localhost:3000/api/webhooks/sms-inbound?provider=mock&team=team_1",
      {
        method: "POST",
        body: JSON.stringify({ phone: "+15550001111", message: "hello" }),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(parseInboundWebhookMock).toHaveBeenCalledOnce();
    expect(mockConvex.mutation).toHaveBeenCalledOnce();
  });
});
