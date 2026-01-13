export type ConvexClientLike = {
  query: (fn: any, args: any) => Promise<any>;
  mutation: (fn: any, args: any) => Promise<any>;
};

export type SMSWebhookResultLike = {
  ok: boolean;
  attemptCount: number;
  httpStatus: number | null;
  failureReason: string | null;
  errorMessage: string | null;
};

export async function fetchAppointmentsWithFilter(args: {
  convex: ConvexClientLike;
  api: any;
  userEmail: string;
  includeCancelled: boolean;
}) {
  return await args.convex.query(args.api.appointments.get, {
    userEmail: args.userEmail,
    includeCancelled: args.includeCancelled,
  });
}

export async function recordBookingConfirmationAndMaybeSuppress(args: {
  convex: ConvexClientLike;
  api: any;
  userEmail: string;
  appointmentId: any;
  patientId: any;
  teamId: any | null | undefined;
  appointmentDateTime: string;
  phone: string;
  name: string | null;
  sendScheduleWebhook: (
    convex: any,
    appointmentId: any,
    patientId: any,
    phone: string,
    name: string | null
  ) => Promise<SMSWebhookResultLike>;
}): Promise<SMSWebhookResultLike> {
  const webhookResult = await args.sendScheduleWebhook(
    args.convex as any,
    args.appointmentId,
    args.patientId,
    args.phone,
    args.name
  );

  await args.convex.mutation(args.api.reminders.recordAppointmentSmsAttempt, {
    userEmail: args.userEmail,
    appointmentId: args.appointmentId,
    patientId: args.patientId,
    messageType: "booking_confirmation",
    targetDate: args.appointmentDateTime,
    webhookResult,
  });

  if (args.teamId && webhookResult.ok) {
    await args.convex.mutation(args.api.reminders.markReminderSentIfInWindow, {
      appointmentId: args.appointmentId,
      patientId: args.patientId,
      appointmentDateTime: args.appointmentDateTime,
      teamId: args.teamId,
    });
  }

  return webhookResult;
}

export async function recordCancellationSmsAttempt(args: {
  convex: ConvexClientLike;
  api: any;
  userEmail: string;
  appointmentId: any;
  patientId: any;
  appointmentDateTime: string;
  patientPhone: string;
  patientName: string | null;
  sendCancelWebhook: (
    convex: any,
    appointmentId: any,
    patientId: any,
    phone: string,
    name: string | null,
    appointmentDateTime: string
  ) => Promise<SMSWebhookResultLike>;
}): Promise<SMSWebhookResultLike> {
  const webhookResult = await args.sendCancelWebhook(
    args.convex as any,
    args.appointmentId,
    args.patientId,
    args.patientPhone,
    args.patientName,
    args.appointmentDateTime
  );

  await args.convex.mutation(args.api.reminders.recordAppointmentSmsAttempt, {
    userEmail: args.userEmail,
    appointmentId: args.appointmentId,
    patientId: args.patientId,
    messageType: "cancellation",
    targetDate: args.appointmentDateTime,
    webhookResult,
  });

  return webhookResult;
}

