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

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: vi.fn(async () => "mock-token"),
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: vi.fn(async () => ({
    userId: "user_1",
    userName: "Staff User",
    userEmail: "staff@example.com",
    teamId: "team_1",
    teamName: "Acme Team",
  })),
  fetchMutation: vi.fn(async () => ({
    messageId: "msg_1",
    phone: "+15551230000",
    teamId: "team_1",
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
  });

  it("marks outbound message failed if provider resolution throws after create", async () => {
    const { fetchQuery: fq, fetchMutation: fm } = await import("convex/nextjs");
    const mockFetchQuery = vi.mocked(fq);
    const mockFetchMutation = vi.mocked(fm);

    const userPayload = {
      userId: "user_1",
      userName: "Staff User",
      userEmail: "staff@example.com",
      teamId: "team_1",
      teamName: "Acme Team",
    };

    // fetchQuery calls in order:
    // 1. getAuthenticatedUser → api.users.currentUser
    // 2. route → api.patients.getById
    // 3. route → api.users.currentUser (for team info)
    mockFetchQuery
      .mockResolvedValueOnce(userPayload as never)
      .mockResolvedValueOnce({
        _id: "patient_1",
        teamId: "team_1",
        name: "Patient One",
        phone: "+15551230000",
      } as never)
      .mockResolvedValueOnce(userPayload as never);

    // fetchMutation: createOutboundMessage
    mockFetchMutation.mockResolvedValueOnce({
      messageId: "msg_1",
      phone: "+15551230000",
      teamId: "team_1",
    } as never);

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

    // Admin client is used only for updateMessageStatus in the catch block
    expect(mockConvex.mutation).toHaveBeenCalledTimes(1);
    expect(mockConvex.mutation.mock.calls[0][1]).toMatchObject({
      messageId: "msg_1",
      status: "failed",
    });
  });
});
