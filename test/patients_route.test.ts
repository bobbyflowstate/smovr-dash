import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

class MockAuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "AuthError";
  }
}

const mockGetAuthenticatedUser = vi.fn();

vi.mock("@/lib/api-utils", () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
  AuthError: MockAuthError,
  safeErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error && !err.message.includes("\n") && err.message.length < 200
      ? err.message
      : fallback,
}));

const mockFetchQuery = vi.fn();
const mockFetchMutation = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchQuery: (...args: unknown[]) => mockFetchQuery(...args),
  fetchMutation: (...args: unknown[]) => mockFetchMutation(...args),
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

const AUTH_USER = {
  token: "tok_test",
  userId: "u1",
  userEmail: "doc@clinic.com",
  teamId: "t1",
  teamName: "Clinic A",
  userName: "Dr. Test",
};

describe("GET /api/patients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { GET } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("lists patients for the team", async () => {
    const patients = [
      { _id: "p1", name: "Alice", phone: "+1111" },
      { _id: "p2", name: "Bob", phone: "+2222" },
    ];
    mockFetchQuery.mockResolvedValue(patients);

    const { GET } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(patients);
  });

  it("passes the real userEmail from auth to fetchQuery", async () => {
    mockFetchQuery.mockResolvedValue([]);

    const { GET } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients");
    await GET(req);

    expect(mockFetchQuery).toHaveBeenCalledWith(
      expect.anything(),
      { userEmail: "doc@clinic.com" },
      { token: "tok_test" }
    );
  });

  it("fetches single patient with history when ?id= is provided", async () => {
    const patientDetail = { _id: "p1", name: "Alice", appointments: [] };
    mockFetchQuery.mockResolvedValue(patientDetail);

    const { GET } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients?id=p1");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockFetchQuery).toHaveBeenCalledWith(
      expect.anything(),
      { userEmail: "doc@clinic.com", patientId: "p1" },
      { token: "tok_test" }
    );
  });

  it("returns 404 when patient not found", async () => {
    mockFetchQuery.mockResolvedValue(null);

    const { GET } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients?id=missing");
    const res = await GET(req);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/patients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { POST } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients", {
      method: "POST",
      body: JSON.stringify({ name: "Alice", phone: "+1111" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const { POST } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients", {
      method: "POST",
      body: JSON.stringify({ phone: "+1111" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 when phone is missing", async () => {
    const { POST } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("creates patient with authenticated user's email", async () => {
    mockFetchMutation.mockResolvedValue({ patientId: "p_new" });

    const { POST } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients", {
      method: "POST",
      body: JSON.stringify({ name: "Alice", phone: "+1111", notes: "test" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockFetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userEmail: "doc@clinic.com",
        name: "Alice",
        phone: "+1111",
      }),
      { token: "tok_test" }
    );
  });
});

describe("PATCH /api/patients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 400 when patientId is missing", async () => {
    const { PATCH } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(400);
  });

  it("updates patient with authenticated email", async () => {
    mockFetchMutation.mockResolvedValue(undefined);

    const { PATCH } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients", {
      method: "PATCH",
      body: JSON.stringify({ patientId: "p1", name: "Alice Updated" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(mockFetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userEmail: "doc@clinic.com",
        patientId: "p1",
        name: "Alice Updated",
      }),
      { token: "tok_test" }
    );
  });
});

describe("DELETE /api/patients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(AUTH_USER);
  });

  it("returns 400 when patient ID query param is missing", async () => {
    const { DELETE } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients", {
      method: "DELETE",
    });
    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });

  it("deletes patient with authenticated email", async () => {
    mockFetchMutation.mockResolvedValue(undefined);

    const { DELETE } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients?id=p1", {
      method: "DELETE",
    });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(mockFetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userEmail: "doc@clinic.com",
        patientId: "p1",
      }),
      { token: "tok_test" }
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new MockAuthError("Not authenticated"));

    const { DELETE } = await import("../src/app/api/patients/route");
    const req = new NextRequest("http://localhost:3000/api/patients?id=p1", {
      method: "DELETE",
    });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
  });
});
