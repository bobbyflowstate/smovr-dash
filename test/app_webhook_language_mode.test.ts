import { describe, expect, it, vi, beforeEach } from "vitest";
import { sendScheduleWebhook, sendCancelWebhook } from "../src/lib/webhook-utils";

const mockFormatScheduleMessage = vi.fn(() => "schedule-message");
const mockFormatCancelMessage = vi.fn(() => "cancel-message");

vi.mock("../convex/webhook_utils", async () => {
  const actual = await vi.importActual("../convex/webhook_utils");
  return {
    ...actual,
    formatScheduleMessage: (...args: unknown[]) => mockFormatScheduleMessage(...args),
    formatCancelMessage: (...args: unknown[]) => mockFormatCancelMessage(...args),
  };
});

vi.mock("@/lib/sms", () => ({
  getSMSProviderForTeam: vi.fn(async () => ({
    sendMessage: vi.fn(async () => ({
      success: true,
      attemptCount: 1,
      httpStatus: 200,
      failureReason: null,
      error: null,
    })),
  })),
}));

describe("src/lib/webhook-utils language mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses team's languageMode for schedule messages", async () => {
    const convex = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "appt_1",
          teamId: "team_1",
          dateTime: "2026-03-20T17:00:00.000Z",
        })
        .mockResolvedValueOnce({
          _id: "pat_1",
          name: "Alex",
        })
        .mockResolvedValueOnce({
          _id: "team_1",
          timezone: "America/Phoenix",
          hospitalAddress: "123 Main St",
          languageMode: "en",
        }),
      mutation: vi.fn(async () => undefined),
    } as any;

    await sendScheduleWebhook(
      convex,
      "appt_1" as any,
      "pat_1" as any,
      "+15551234567",
      "Alex",
    );

    expect(mockFormatScheduleMessage).toHaveBeenCalled();
    expect(mockFormatScheduleMessage.mock.calls[0][6]).toBe("en");
  });

  it("uses team's languageMode for cancel messages", async () => {
    const convex = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "appt_1",
          teamId: "team_1",
        })
        .mockResolvedValueOnce({
          _id: "team_1",
          timezone: "America/Phoenix",
          hospitalAddress: "123 Main St",
          languageMode: "en",
        }),
      mutation: vi.fn(async () => undefined),
    } as any;

    await sendCancelWebhook(
      convex,
      "appt_1" as any,
      "pat_1" as any,
      "+15551234567",
      "Alex",
      "2026-03-20T17:00:00.000Z",
    );

    expect(mockFormatCancelMessage).toHaveBeenCalled();
    expect(mockFormatCancelMessage.mock.calls[0][4]).toBe("en");
  });
});
