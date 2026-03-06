/**
 * Shared webhook utility functions
 * 
 * This is the source of truth for all webhook-related utilities.
 * Both Convex functions and Next.js import from this file.
 * 
 * Note: Convex functions can only import from convex/, so shared code
 * must live here. Next.js can import from anywhere.
 */

import { Id } from "./_generated/dataModel";
import {
  createProviderFromConfig,
  getDefaultProvider,
  type TeamSmsConfig,
} from "./sms_factory";
import type { SendResult } from "./sms_provider";

export type LanguageMode = "en" | "en_es";

// ---------------------------------------------------------------------------
// Locale registry — add new languages here. Bilingual modes like "en_es" are
// resolved automatically by splitting on "_" and combining the matching locales.
// ---------------------------------------------------------------------------

export interface MessageLocale {
  dateTime: string;
  address: string;
  statusPrompt: string;
  late15: string;
  late30: string;
  rescheduleOption: string;
  rescheduleContactNote: string;

  scheduleConfirmed(name: string | null): string;
  appointmentCanceled(name: string | null): string;
  reminder24hTomorrow(name: string | null): string;
  reminder24hToday(name: string | null): string;
  reminder24hUpcoming(name: string | null): string;
  reminder1h(name: string | null): string;
  birthdayGreeting(name: string | null): string;
  returnDateReminder(name: string | null): string;
  referralFollowUp(name: string | null): string;
  reactivation(name: string | null): string;
  websiteEntry(name: string | null): string;
  bookingConfirmation(name: string | null): string;
}

export const LOCALES: Record<string, MessageLocale> = {
  en: {
    dateTime: "Date & Time",
    address: "Address",
    statusPrompt: "Let us know if you are",
    late15: "15 mins late",
    late30: "30 mins late",
    rescheduleOption: "Need to reschedule",
    rescheduleContactNote: "If you need to reschedule, please contact us.",

    scheduleConfirmed: (n) => n ? `Hi ${n}, your appointment is confirmed.` : "Your appointment is confirmed.",
    appointmentCanceled: (n) => n ? `Hi ${n}, your appointment has been canceled.` : "Your appointment has been canceled.",
    reminder24hTomorrow: (n) => n ? `Hi ${n}, just a reminder that your appointment is tomorrow.` : "Just a reminder that your appointment is tomorrow.",
    reminder24hToday: (n) => n ? `Hi ${n}, just a reminder that your appointment is today.` : "Just a reminder that your appointment is today.",
    reminder24hUpcoming: (n) => n ? `Hi ${n}, just a reminder about your upcoming appointment.` : "Just a reminder about your upcoming appointment.",
    reminder1h: (n) => n ? `Hi ${n}, just a reminder that your appointment is in about 1 hour.` : "Just a reminder that your appointment is in about 1 hour.",
    birthdayGreeting: (n) => n ? `Hello ${n}, happy birthday from everyone at our office! We wish you a great day.` : "Happy birthday from everyone at our office! We wish you a great day.",
    returnDateReminder: (n) => n ? `Hello ${n}, it may be time to schedule your next visit. Please click the link to book an appointment:` : "It may be time to schedule your next visit. Please click the link to book an appointment:",
    referralFollowUp: (n) => n ? `Hi ${n}, just checking in about the appointment we discussed. Please click the link below to let us know your status:` : "Just checking in about the appointment we discussed. Please click the link below to let us know your status:",
    reactivation: (n) => n ? `Hi ${n}, we have not seen you in a while and just wanted to check in. If you would like to schedule a visit, you can do that here:` : "We have not seen you in a while and just wanted to check in. If you would like to schedule a visit, you can do that here:",
    websiteEntry: (n) => n ? `Hello ${n}, thanks for reaching out! How can we help you today?` : "Thanks for reaching out! How can we help you today?",
    bookingConfirmation: (n) => n ? `Hi ${n}, thank you for your scheduling request! Our team will be in touch shortly to confirm your appointment.` : "Thank you for your scheduling request! Our team will be in touch shortly to confirm your appointment.",
  },
  es: {
    dateTime: "Fecha y hora",
    address: "Dirección",
    statusPrompt: "Infórmenos si usted",
    late15: "15 minutos tarde",
    late30: "30 minutos tarde",
    rescheduleOption: "Necesita reprogramar",
    rescheduleContactNote: "Si necesita reprogramar, por favor contáctenos.",

    scheduleConfirmed: (n) => n ? `Hola ${n}, su cita está confirmada.` : "Su cita está confirmada.",
    appointmentCanceled: (n) => n ? `Hola ${n}, su cita ha sido cancelada.` : "Su cita ha sido cancelada.",
    reminder24hTomorrow: (n) => n ? `Hola ${n}, un recordatorio de que su cita es mañana.` : "Un recordatorio de que su cita es mañana.",
    reminder24hToday: (n) => n ? `Hola ${n}, un recordatorio de que su cita es hoy.` : "Un recordatorio de que su cita es hoy.",
    reminder24hUpcoming: (n) => n ? `Hola ${n}, un recordatorio sobre su próxima cita.` : "Un recordatorio sobre su próxima cita.",
    reminder1h: (n) => n ? `Hola ${n}, un recordatorio rápido de que su cita es en aproximadamente 1 hora.` : "Un recordatorio rápido de que su cita es en aproximadamente 1 hora.",
    birthdayGreeting: (n) => n ? `Hola ${n}, feliz cumpleaños de parte de todos en nuestra oficina. Le deseamos un gran día.` : "Feliz cumpleaños de parte de todos en nuestra oficina. Le deseamos un gran día.",
    returnDateReminder: (n) => n ? `Hola ${n}, puede ser momento de programar su próxima visita. Por favor haga clic en el enlace para reservar una cita:` : "Puede ser momento de programar su próxima visita. Por favor haga clic en el enlace para reservar una cita:",
    referralFollowUp: (n) => n ? `Hola ${n}, solo queríamos verificar sobre la cita que comentamos. Por favor haga clic en el enlace para indicarnos su estado:` : "Solo queríamos verificar sobre la cita que comentamos. Por favor haga clic en el enlace para indicarnos su estado:",
    reactivation: (n) => n ? `Hola ${n}, hace tiempo que no lo vemos y queríamos saludar. Si desea programar una visita puede hacerlo aquí:` : "Hace tiempo que no lo vemos y queríamos saludar. Si desea programar una visita puede hacerlo aquí:",
    websiteEntry: (n) => n ? `Hola ${n}, ¡gracias por comunicarse! ¿Cómo podemos ayudarle hoy?` : "¡Gracias por comunicarse! ¿Cómo podemos ayudarle hoy?",
    bookingConfirmation: (n) => n ? `Hola ${n}, ¡gracias por su solicitud de cita! Nuestro equipo se comunicará pronto para confirmar su cita.` : "¡Gracias por su solicitud de cita! Nuestro equipo se comunicará pronto para confirmar su cita.",
  },
};

type GreetingKey =
  | "scheduleConfirmed"
  | "appointmentCanceled"
  | "reminder24hTomorrow"
  | "reminder24hToday"
  | "reminder24hUpcoming"
  | "reminder1h"
  | "birthdayGreeting"
  | "returnDateReminder"
  | "referralFollowUp"
  | "reactivation"
  | "websiteEntry"
  | "bookingConfirmation";

export interface ResolvedMessages {
  dateTimeLabel: string;
  addressLabel: string;
  statusPromptLabel: string;
  late15Label: string;
  late30Label: string;
  rescheduleOptionLabel: string;
  rescheduleContactNote: string;

  scheduleConfirmed: (name: string | null) => string;
  appointmentCanceled: (name: string | null) => string;
  reminder24hTomorrow: (name: string | null) => string;
  reminder24hToday: (name: string | null) => string;
  reminder24hUpcoming: (name: string | null) => string;
  reminder1h: (name: string | null) => string;
  birthdayGreeting: (name: string | null) => string;
  returnDateReminder: (name: string | null) => string;
  referralFollowUp: (name: string | null) => string;
  reactivation: (name: string | null) => string;
  websiteEntry: (name: string | null) => string;
  bookingConfirmation: (name: string | null) => string;
}

/**
 * Resolve locale data for a given language mode.
 *
 * Single-language modes (e.g. "en") use one locale directly.
 * Multi-language modes (e.g. "en_es") split on "_" and combine locales:
 *   - labels joined with " / "
 *   - greetings/notes joined with "\n"
 */
export function resolveMessages(mode: LanguageMode): ResolvedMessages {
  const codes = mode.split("_");
  const locales = codes.map((c) => {
    const l = LOCALES[c];
    if (!l) throw new Error(`Unknown locale code: ${c}`);
    return l;
  });

  const joinLabel = (get: (l: MessageLocale) => string) =>
    locales.map(get).join(" / ");

  const joinLines = (get: (l: MessageLocale) => string) =>
    locales.map(get).join("\n");

  const joinGreeting = (key: GreetingKey) =>
    (name: string | null) => locales.map((l) => l[key](name)).join("\n");

  return {
    dateTimeLabel: joinLabel((l) => l.dateTime) + ":",
    addressLabel: joinLabel((l) => l.address) + ":",
    statusPromptLabel: joinLabel((l) => l.statusPrompt) + ":",
    late15Label: "• " + joinLabel((l) => l.late15) + ":",
    late30Label: "• " + joinLabel((l) => l.late30) + ":",
    rescheduleOptionLabel: "• " + joinLabel((l) => l.rescheduleOption) + ":",
    rescheduleContactNote: joinLines((l) => l.rescheduleContactNote),

    scheduleConfirmed: joinGreeting("scheduleConfirmed"),
    appointmentCanceled: joinGreeting("appointmentCanceled"),
    reminder24hTomorrow: joinGreeting("reminder24hTomorrow"),
    reminder24hToday: joinGreeting("reminder24hToday"),
    reminder24hUpcoming: joinGreeting("reminder24hUpcoming"),
    reminder1h: joinGreeting("reminder1h"),
    birthdayGreeting: joinGreeting("birthdayGreeting"),
    returnDateReminder: joinGreeting("returnDateReminder"),
    referralFollowUp: joinGreeting("referralFollowUp"),
    reactivation: joinGreeting("reactivation"),
    websiteEntry: joinGreeting("websiteEntry"),
    bookingConfirmation: joinGreeting("bookingConfirmation"),
  };
}

// ---------------------------------------------------------------------------
// Scheduling link resolution
// ---------------------------------------------------------------------------

export interface SchedulingLinkTeam {
  rescheduleUrl?: string;
  entrySlug?: string;
}

/**
 * Resolve the scheduling/booking link for a team.
 *
 * 1. If `team.rescheduleUrl` is set, use that external URL (full override).
 * 2. Otherwise fall back to the SMOVR-hosted `/book/[entrySlug]` page.
 * 3. If neither is available, returns null.
 */
export function getSchedulingLink(
  team: SchedulingLinkTeam | null | undefined,
  baseUrl: string,
): string | null {
  if (team?.rescheduleUrl) return team.rescheduleUrl;
  if (team?.entrySlug) return `${baseUrl}/book/${team.entrySlug}`;
  return null;
}

export type SMSWebhookFailureReason =
  | "WEBHOOK_URL_NOT_CONFIGURED"
  | "HTTP_NON_RETRYABLE"
  | "HTTP_RETRY_EXHAUSTED"
  | "TIMEOUT"
  | "NETWORK_ERROR";

export type SMSWebhookResult = {
  ok: boolean;
  attemptCount: number;
  httpStatus: number | null;
  failureReason: SMSWebhookFailureReason | null;
  errorMessage: string | null;
};

/**
 * Formats appointment date/time for webhook payload
 * 
 * @param appointmentDate The appointment date as a Date object
 * @param timezone IANA timezone string (e.g., 'America/Los_Angeles')
 * @returns Object with formatted date strings for webhook payload
 */
export function formatAppointmentDateTime(appointmentDate: Date, timezone: string): {
  appointmentDateStr: string;
  appointmentTimeStr: string;
  appointmentDateTimeStr: string;
} {
  // Format date prettier: "January 15, 2024"
  const appointmentDateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(appointmentDate);
  
  // Format time in timezone: "2:30 PM" (hours and minutes only)
  const appointmentTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(appointmentDate);

  // Format datetime in timezone: "12-21-2021 08:30 AM" (MM-DD-YYYY HH:MM A)
  const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  
  const parts = timezoneFormatter.formatToParts(appointmentDate);
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  const ampm = parts.find(p => p.type === 'dayPeriod')?.value || '';
  
  const appointmentDateTimeStr = `${month}-${day}-${year} ${hour}:${minute} ${ampm}`;

  return { appointmentDateStr, appointmentTimeStr, appointmentDateTimeStr };
}

function getTimezoneLabelShort(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || timezone;
  } catch {
    return timezone;
  }
}

/** Convert a provider SendResult to the legacy SMSWebhookResult */
function toWebhookResult(r: SendResult): SMSWebhookResult {
  if (r.success) {
    return {
      ok: true,
      attemptCount: r.attemptCount,
      httpStatus: r.httpStatus ?? null,
      failureReason: null,
      errorMessage: null,
    };
  }
  const failMap: Record<string, SMSWebhookFailureReason> = {
    HTTP_ERROR: "HTTP_NON_RETRYABLE",
    TIMEOUT: "TIMEOUT",
    RATE_LIMITED: "HTTP_RETRY_EXHAUSTED",
  };
  return {
    ok: false,
    attemptCount: r.attemptCount,
    httpStatus: r.httpStatus ?? null,
    failureReason: failMap[r.failureReason ?? ""] ?? "NETWORK_ERROR",
    errorMessage: r.error ?? null,
  };
}

/**
 * Send an SMS through the pluggable provider system.
 *
 * Backwards-compatible: if no `teamConfig` is supplied the provider is
 * resolved from environment variables (Twilio -> GHL -> Mock), which is
 * the same behaviour as the previous GHL-only implementation.
 */
export async function sendSMSWebhookDetailed(
  phone: string,
  message: string,
  teamConfig?: TeamSmsConfig | null,
): Promise<SMSWebhookResult> {
  const provider = teamConfig
    ? createProviderFromConfig(teamConfig) ?? getDefaultProvider()
    : getDefaultProvider();

  const result = await provider.sendMessage({ to: phone, body: message });
  return toWebhookResult(result);
}

/**
 * Convenience wrapper that returns a simple boolean.
 */
export async function sendSMSWebhook(
  phone: string,
  message: string,
  teamConfig?: TeamSmsConfig | null,
): Promise<boolean> {
  const result = await sendSMSWebhookDetailed(phone, message, teamConfig);
  return result.ok;
}

/**
 * Formats schedule confirmation message using the locale registry.
 *
 * @param schedulingLink - Optional override for the reschedule URL. When
 *   provided (from getSchedulingLink), replaces the default /reschedule-cancel link.
 */
export function formatScheduleMessage(
  patientName: string | null,
  appointmentDate: Date,
  appointmentId: Id<"appointments">,
  baseUrl: string,
  timezone: string,
  hospitalAddress: string,
  languageMode: LanguageMode = "en_es",
  schedulingLink?: string | null,
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const tzLabel = getTimezoneLabelShort(timezone);
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = schedulingLink || `${baseUrl}/reschedule-cancel/${appointmentId}`;
  const m = resolveMessages(languageMode);
  
  return `${m.scheduleConfirmed(patientName)}\n\n` +
    `${m.dateTimeLabel}\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
    `${m.addressLabel}\n${hospitalAddress}\n\n` +
    `${m.statusPromptLabel}\n\n` +
    `${m.late15Label}\n${url15}\n\n` +
    `${m.late30Label}\n${url30}\n\n` +
    `${m.rescheduleOptionLabel}\n${urlReschedule}`;
}

/**
 * Formats cancellation notification message using the locale registry.
 */
export function formatCancelMessage(
  patientName: string | null,
  appointmentDate: Date,
  timezone: string,
  hospitalAddress: string,
  languageMode: LanguageMode = "en_es",
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const tzLabel = getTimezoneLabelShort(timezone);
  const m = resolveMessages(languageMode);
  
  return `${m.appointmentCanceled(patientName)}\n\n` +
    `${m.dateTimeLabel}\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
    `${m.addressLabel}\n${hospitalAddress}\n\n` +
    m.rescheduleContactNote;
}

/**
 * Gets the relative day label for an appointment date compared to now
 * Returns "today", "tomorrow", or null (use full date instead)
 */
function getRelativeDayLabel(appointmentDate: Date, timezone: string): 'today' | 'tomorrow' | null {
  const now = new Date();
  
  // Get today's date in the timezone (YYYY-MM-DD format for comparison)
  const todayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const todayStr = todayFormatter.format(now);
  const appointmentStr = todayFormatter.format(appointmentDate);
  
  if (appointmentStr === todayStr) {
    return 'today';
  }
  
  // Check if appointment is tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = todayFormatter.format(tomorrow);
  
  if (appointmentStr === tomorrowStr) {
    return 'tomorrow';
  }
  
  return null;
}

/**
 * Formats 24h reminder message using the locale registry.
 */
export function formatReminder24hMessage(
  patientName: string | null,
  appointmentDate: Date,
  appointmentId: Id<"appointments">,
  baseUrl: string,
  timezone: string,
  hospitalAddress: string,
  languageMode: LanguageMode = "en_es",
  schedulingLink?: string | null,
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const tzLabel = getTimezoneLabelShort(timezone);
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = schedulingLink || `${baseUrl}/reschedule-cancel/${appointmentId}`;
  const m = resolveMessages(languageMode);
  
  const relativeDay = getRelativeDayLabel(appointmentDate, timezone);
  const greetingKey: GreetingKey =
    relativeDay === "tomorrow" ? "reminder24hTomorrow"
    : relativeDay === "today" ? "reminder24hToday"
    : "reminder24hUpcoming";
  
  return `${m[greetingKey](patientName)}\n\n` +
    `${m.dateTimeLabel}\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
    `${m.addressLabel}\n${hospitalAddress}\n\n` +
    `${m.statusPromptLabel}\n\n` +
    `${m.late15Label}\n${url15}\n\n` +
    `${m.late30Label}\n${url30}\n\n` +
    `${m.rescheduleOptionLabel}\n${urlReschedule}`;
}

/**
 * Formats 1h reminder message using the locale registry.
 */
export function formatReminder1hMessage(
  patientName: string | null,
  appointmentDate: Date,
  appointmentId: Id<"appointments">,
  baseUrl: string,
  timezone: string,
  hospitalAddress: string,
  languageMode: LanguageMode = "en_es",
  schedulingLink?: string | null,
): string {
  const { appointmentDateStr, appointmentTimeStr } = formatAppointmentDateTime(appointmentDate, timezone);
  const tzLabel = getTimezoneLabelShort(timezone);
  const url15 = `${baseUrl}/15-late/${appointmentId}`;
  const url30 = `${baseUrl}/30-late/${appointmentId}`;
  const urlReschedule = schedulingLink || `${baseUrl}/reschedule-cancel/${appointmentId}`;
  const m = resolveMessages(languageMode);
  
  return `${m.reminder1h(patientName)}\n\n` +
    `${m.dateTimeLabel}\n${appointmentDateStr} ${appointmentTimeStr} (${tzLabel})\n\n` +
    `${m.addressLabel}\n${hospitalAddress}\n\n` +
    `${m.statusPromptLabel}\n\n` +
    `${m.late15Label}\n${url15}\n\n` +
    `${m.late30Label}\n${url30}\n\n` +
    `${m.rescheduleOptionLabel}\n${urlReschedule}`;
}

/**
 * Formats a birthday greeting message using the locale registry.
 */
export function formatBirthdayMessage(
  patientName: string | null,
  languageMode: LanguageMode = "en_es",
): string {
  const m = resolveMessages(languageMode);
  return m.birthdayGreeting(patientName);
}

export function formatReturnDateMessage(
  patientName: string | null,
  schedulingLink: string,
  languageMode: LanguageMode = "en_es",
): string {
  const m = resolveMessages(languageMode);
  return `${m.returnDateReminder(patientName)}\n${schedulingLink}`;
}

export function formatReferralFollowUpMessage(
  patientName: string | null,
  statusLink: string,
  languageMode: LanguageMode = "en_es",
): string {
  const m = resolveMessages(languageMode);
  return `${m.referralFollowUp(patientName)}\n${statusLink}`;
}

export function formatReactivationMessage(
  patientName: string | null,
  schedulingLink: string,
  languageMode: LanguageMode = "en_es",
): string {
  const m = resolveMessages(languageMode);
  return `${m.reactivation(patientName)}\n${schedulingLink}`;
}

export function formatBookingConfirmationMessage(
  patientName: string | null,
  languageMode: LanguageMode = "en_es",
): string {
  const m = resolveMessages(languageMode);
  return m.bookingConfirmation(patientName);
}

export function formatWebsiteEntryMessage(
  patientName: string | null,
  languageMode: LanguageMode = "en_es",
): string {
  const m = resolveMessages(languageMode);
  return m.websiteEntry(patientName);
}
