import { describe, expect, it, vi, beforeEach } from "vitest";

const mockConvexAuthNextjsToken = vi.fn();
const mockFetchQuery = vi.fn();

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: (...args: unknown[]) => mockConvexAuthNextjsToken(...args),
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: (...args: unknown[]) => mockFetchQuery(...args),
}));

import { getAuthenticatedUser, AuthError, safeErrorMessage } from "../src/lib/api-utils";

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user data when authenticated", async () => {
    mockConvexAuthNextjsToken.mockResolvedValue("valid-token");
    mockFetchQuery.mockResolvedValue({
      userId: "u1",
      userName: "Alice",
      userEmail: "alice@example.com",
      teamId: "t1",
      teamName: "Team A",
    });

    const result = await getAuthenticatedUser();

    expect(result).toEqual({
      token: "valid-token",
      userId: "u1",
      userName: "Alice",
      userEmail: "alice@example.com",
      teamId: "t1",
      teamName: "Team A",
    });
  });

  it("throws AuthError when token is null", async () => {
    mockConvexAuthNextjsToken.mockResolvedValue(null);

    await expect(getAuthenticatedUser()).rejects.toThrow(AuthError);
    await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");
    expect(mockFetchQuery).not.toHaveBeenCalled();
  });

  it("throws AuthError when token is undefined", async () => {
    mockConvexAuthNextjsToken.mockResolvedValue(undefined);

    await expect(getAuthenticatedUser()).rejects.toThrow(AuthError);
  });

  it("throws AuthError when currentUser returns null", async () => {
    mockConvexAuthNextjsToken.mockResolvedValue("valid-token");
    mockFetchQuery.mockResolvedValue(null);

    await expect(getAuthenticatedUser()).rejects.toThrow(AuthError);
    await expect(getAuthenticatedUser()).rejects.toThrow("User not found");
  });

  it("throws AuthError when user has no email", async () => {
    mockConvexAuthNextjsToken.mockResolvedValue("valid-token");
    mockFetchQuery.mockResolvedValue({
      userId: "u1",
      userName: "Ghost",
      userEmail: undefined,
      teamId: "t1",
      teamName: "Team A",
    });

    await expect(getAuthenticatedUser()).rejects.toThrow(AuthError);
  });

  it("returns user even when teamId is undefined", async () => {
    mockConvexAuthNextjsToken.mockResolvedValue("valid-token");
    mockFetchQuery.mockResolvedValue({
      userId: "u1",
      userName: "NewUser",
      userEmail: "new@example.com",
      teamId: undefined,
      teamName: "Unknown Team",
    });

    const result = await getAuthenticatedUser();
    expect(result.teamId).toBeUndefined();
    expect(result.userEmail).toBe("new@example.com");
  });

  it("passes token to fetchQuery", async () => {
    mockConvexAuthNextjsToken.mockResolvedValue("tok_abc");
    mockFetchQuery.mockResolvedValue({
      userId: "u1",
      userEmail: "a@b.com",
      teamId: "t1",
      teamName: "T",
    });

    await getAuthenticatedUser();

    expect(mockFetchQuery).toHaveBeenCalledWith(
      expect.anything(),
      {},
      { token: "tok_abc" }
    );
  });
});

describe("AuthError", () => {
  it("is an instance of Error", () => {
    const err = new AuthError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthError);
  });

  it("has name set to AuthError", () => {
    const err = new AuthError("oops");
    expect(err.name).toBe("AuthError");
  });

  it("is distinguishable from generic Error via instanceof", () => {
    const authErr = new AuthError("auth fail");
    const genericErr = new Error("generic fail");

    expect(authErr instanceof AuthError).toBe(true);
    expect(genericErr instanceof AuthError).toBe(false);
  });
});

describe("safeErrorMessage", () => {
  it("returns the error message for short single-line errors", () => {
    const err = new Error("Patient not found");
    expect(safeErrorMessage(err, "fallback")).toBe("Patient not found");
  });

  it("returns fallback for multi-line error messages", () => {
    const err = new Error("line1\nline2\nline3");
    expect(safeErrorMessage(err, "Something went wrong")).toBe("Something went wrong");
  });

  it("returns fallback for very long error messages", () => {
    const err = new Error("x".repeat(201));
    expect(safeErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("returns fallback for non-Error values", () => {
    expect(safeErrorMessage("string error", "fallback")).toBe("fallback");
    expect(safeErrorMessage(42, "fallback")).toBe("fallback");
    expect(safeErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("returns message at exactly 199 characters", () => {
    const msg = "a".repeat(199);
    expect(safeErrorMessage(new Error(msg), "fallback")).toBe(msg);
  });
});
