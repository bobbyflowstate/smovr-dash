import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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

vi.mock("@logto/next/server-actions", () => ({
  getLogtoContext: vi.fn(async () => ({
    isAuthenticated: true,
    claims: { email: "staff@example.com" },
  })),
}));

vi.mock("@/lib/sms", () => ({
  getSMSProviderForTeam: vi.fn(async () => {
    throw new Error("Provider misconfigured");
  }),
  getDefaultSMSProvider: vi.fn(),
  resolveTemplatePlaceholders: vi.fn((body: string) => body),
}));

describe("POST /api/messages/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConvex.query.mockImplementation(async (_fn: unknown, args: Record<string, unknown>) => {
      if ("patientId" in args) {
        return {
          _id: args.patientId,
          teamId: "team_1",
          name: "Patient One",
          phone: "+15551230000",
        };
      }

      if ("userEmail" in args) {
        return {
          teamId: "team_1",
          teamName: "Acme Team",
        };
      }

      return null;
    });

    let mutationCall = 0;
    mockConvex.mutation.mockImplementation(async () => {
      mutationCall += 1;
      if (mutationCall === 1) {
        return {
          messageId: "msg_1",
          phone: "+15551230000",
          teamId: "team_1",
        };
      }
      return null;
    });
  });

  it("marks outbound message failed if provider resolution throws after create", async () => {
    const { POST } = await import("../src/app/api/messages/send/route");
    const request = new NextRequest("http://localhost:3000/api/messages/send", {
      method: "POST",
      body: JSON.stringify({
        patientId: "patient_1",
        body: "hello",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    expect(mockConvex.mutation).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockConvex.mutation.mock.calls[1][1];
    expect(secondCallArgs).toMatchObject({
      messageId: "msg_1",
      status: "failed",
    });
  });
});
