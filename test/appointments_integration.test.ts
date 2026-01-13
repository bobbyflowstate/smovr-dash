import { describe, expect, it, vi } from "vitest";
import {
  fetchAppointmentsWithFilter,
  recordBookingConfirmationAndMaybeSuppress,
  recordCancellationSmsAttempt,
  type SMSWebhookResultLike,
} from "../src/lib/appointments-integration";

describe("thin integration: appointments wiring", () => {
  it("GET appointments passes includeCancelled through to Convex query", async () => {
    const api = { appointments: { get: Symbol("appointments.get") } };
    const convex = {
      query: vi.fn().mockResolvedValue({ appointments: [] }),
      mutation: vi.fn(),
    };

    await fetchAppointmentsWithFilter({
      convex,
      api,
      userEmail: "dev@example.com",
      includeCancelled: true,
    });

    expect(convex.query).toHaveBeenCalledWith(api.appointments.get, {
      userEmail: "dev@example.com",
      includeCancelled: true,
    });
  });

  it("records booking confirmation and suppresses 24h only when webhook ok", async () => {
    const api = {
      reminders: {
        recordAppointmentSmsAttempt: Symbol("reminders.recordAppointmentSmsAttempt"),
        markReminderSentIfInWindow: Symbol("reminders.markReminderSentIfInWindow"),
      },
    };

    const convex = {
      query: vi.fn(),
      mutation: vi.fn().mockResolvedValue(null),
    };

    const okResult: SMSWebhookResultLike = {
      ok: true,
      attemptCount: 1,
      httpStatus: 200,
      failureReason: null,
      errorMessage: null,
    };

    const sendScheduleWebhook = vi.fn().mockResolvedValue(okResult);

    await recordBookingConfirmationAndMaybeSuppress({
      convex,
      api,
      userEmail: "dev@example.com",
      appointmentId: "appt1",
      patientId: "pat1",
      teamId: "team1",
      appointmentDateTime: "2026-01-01T00:00:00.000Z",
      phone: "+15551234567",
      name: "Jane",
      sendScheduleWebhook,
    });

    expect(sendScheduleWebhook).toHaveBeenCalledWith(
      convex,
      "appt1",
      "pat1",
      "+15551234567",
      "Jane"
    );

    expect(convex.mutation).toHaveBeenCalledWith(api.reminders.recordAppointmentSmsAttempt, {
      userEmail: "dev@example.com",
      appointmentId: "appt1",
      patientId: "pat1",
      messageType: "booking_confirmation",
      targetDate: "2026-01-01T00:00:00.000Z",
      webhookResult: okResult,
    });

    expect(convex.mutation).toHaveBeenCalledWith(api.reminders.markReminderSentIfInWindow, {
      appointmentId: "appt1",
      patientId: "pat1",
      appointmentDateTime: "2026-01-01T00:00:00.000Z",
      teamId: "team1",
    });
  });

  it("records booking confirmation but does not suppress when webhook failed", async () => {
    const api = {
      reminders: {
        recordAppointmentSmsAttempt: Symbol("reminders.recordAppointmentSmsAttempt"),
        markReminderSentIfInWindow: Symbol("reminders.markReminderSentIfInWindow"),
      },
    };

    const convex = {
      query: vi.fn(),
      mutation: vi.fn().mockResolvedValue(null),
    };

    const failResult: SMSWebhookResultLike = {
      ok: false,
      attemptCount: 2,
      httpStatus: 503,
      failureReason: "HTTP_RETRY_EXHAUSTED",
      errorMessage: null,
    };

    const sendScheduleWebhook = vi.fn().mockResolvedValue(failResult);

    await recordBookingConfirmationAndMaybeSuppress({
      convex,
      api,
      userEmail: "dev@example.com",
      appointmentId: "appt1",
      patientId: "pat1",
      teamId: "team1",
      appointmentDateTime: "2026-01-01T00:00:00.000Z",
      phone: "+15551234567",
      name: null,
      sendScheduleWebhook,
    });

    expect(convex.mutation).toHaveBeenCalledWith(api.reminders.recordAppointmentSmsAttempt, expect.anything());
    expect(convex.mutation).not.toHaveBeenCalledWith(api.reminders.markReminderSentIfInWindow, expect.anything());
  });

  it("does not suppress when teamId missing (even if webhook ok)", async () => {
    const api = {
      reminders: {
        recordAppointmentSmsAttempt: Symbol("reminders.recordAppointmentSmsAttempt"),
        markReminderSentIfInWindow: Symbol("reminders.markReminderSentIfInWindow"),
      },
    };

    const convex = {
      query: vi.fn(),
      mutation: vi.fn().mockResolvedValue(null),
    };

    const okResult: SMSWebhookResultLike = {
      ok: true,
      attemptCount: 1,
      httpStatus: 200,
      failureReason: null,
      errorMessage: null,
    };

    const sendScheduleWebhook = vi.fn().mockResolvedValue(okResult);

    await recordBookingConfirmationAndMaybeSuppress({
      convex,
      api,
      userEmail: "dev@example.com",
      appointmentId: "appt1",
      patientId: "pat1",
      teamId: null,
      appointmentDateTime: "2026-01-01T00:00:00.000Z",
      phone: "+15551234567",
      name: null,
      sendScheduleWebhook,
    });

    expect(convex.mutation).toHaveBeenCalledWith(api.reminders.recordAppointmentSmsAttempt, expect.anything());
    expect(convex.mutation).not.toHaveBeenCalledWith(api.reminders.markReminderSentIfInWindow, expect.anything());
  });

  it("records cancellation sms attempt with correct payload", async () => {
    const api = {
      reminders: {
        recordAppointmentSmsAttempt: Symbol("reminders.recordAppointmentSmsAttempt"),
      },
    };

    const convex = {
      query: vi.fn(),
      mutation: vi.fn().mockResolvedValue(null),
    };

    const okResult: SMSWebhookResultLike = {
      ok: true,
      attemptCount: 1,
      httpStatus: 200,
      failureReason: null,
      errorMessage: null,
    };

    const sendCancelWebhook = vi.fn().mockResolvedValue(okResult);

    await recordCancellationSmsAttempt({
      convex,
      api,
      userEmail: "dev@example.com",
      appointmentId: "appt1",
      patientId: "pat1",
      appointmentDateTime: "2026-01-01T00:00:00.000Z",
      patientPhone: "+15551234567",
      patientName: "Jane",
      sendCancelWebhook,
    });

    expect(sendCancelWebhook).toHaveBeenCalledWith(
      convex,
      "appt1",
      "pat1",
      "+15551234567",
      "Jane",
      "2026-01-01T00:00:00.000Z"
    );

    expect(convex.mutation).toHaveBeenCalledWith(api.reminders.recordAppointmentSmsAttempt, {
      userEmail: "dev@example.com",
      appointmentId: "appt1",
      patientId: "pat1",
      messageType: "cancellation",
      targetDate: "2026-01-01T00:00:00.000Z",
      webhookResult: okResult,
    });
  });
});

