/**
 * Pro feature reminder actions: birthday, return-date, referral follow-up.
 *
 * Kept separate from the core appointment reminders in reminders.ts to avoid
 * bloating that already-large module.
 */

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import {
  sendSMSWebhookDetailed,
  formatBirthdayMessage,
  formatReturnDateMessage,
  formatReferralFollowUpMessage,
  formatReactivationMessage,
  getSchedulingLink,
  type LanguageMode,
} from "./webhook_utils";
import type { TeamSmsConfig } from "./sms_factory";
import {
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_QUIET_HOURS_END,
  isInQuietHours,
} from "./reminder_policies";
import { createActionLogger, createQueryLogger } from "./lib/logger";

// ---------------------------------------------------------------------------
// Internal queries used by the birthday action
// ---------------------------------------------------------------------------

/**
 * Return all patients whose birthday (MM-DD) matches `todayMMDD` for a given team.
 */
export const getPatientsWithBirthday = internalQuery({
  args: {
    teamId: v.id("teams"),
    todayMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const log = createQueryLogger("proReminders.getPatientsWithBirthday", {
      teamId: args.teamId,
    });
    const patients = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const matchesBirthday = (birthday?: string): boolean => {
      if (!birthday) return false;
      const parts = birthday.split("-");
      if (parts.length === 2) {
        return birthday === args.todayMMDD;
      }
      // Legacy format support: YYYY-MM-DD
      if (parts.length === 3) {
        const mmdd = `${parts[1]}-${parts[2]}`;
        return mmdd === args.todayMMDD;
      }
      return false;
    };

    const birthdayPatients = patients.filter((p) => matchesBirthday(p.birthday));
    log.debug("Found birthday patients", {
      count: birthdayPatients.length,
      todayMMDD: args.todayMMDD,
    });
    return birthdayPatients;
  },
});

/**
 * Check if a birthday reminder was already sent for a patient this year.
 */
export const getBirthdayReminderForYear = internalQuery({
  args: {
    patientId: v.id("patients"),
    yearStr: v.string(), // e.g. "2026"
  },
  handler: async (ctx, args) => {
    const targetDate = args.yearStr;
    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_patient_type_date", (q) =>
        q.eq("patientId", args.patientId).eq("reminderType", "birthday").eq("targetDate", targetDate),
      )
      .first();
    return existing;
  },
});

/** Return all teams (used by the daily cron to iterate). */
export const getAllTeams = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("teams").collect();
  },
});

// ---------------------------------------------------------------------------
// Birthday reminder action
// ---------------------------------------------------------------------------

/**
 * Daily action: for each team, find patients whose MM-DD birthday matches
 * today (in the team's timezone) and send a birthday SMS if not already sent
 * this year.
 */
export const checkAndSendBirthdayReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const log = createActionLogger("proReminders.checkAndSendBirthdayReminders");
    log.info("Starting birthday reminder check");

    const teams: Doc<"teams">[] = await ctx.runQuery(internal.proReminders.getAllTeams, {});
    log.info("Loaded teams", { count: teams.length });

    let totalSent = 0;
    let totalSkipped = 0;

    for (const team of teams) {
      const timezone = team.timezone || "America/Los_Angeles";
      const languageMode: LanguageMode = (team.languageMode as LanguageMode) ?? "en_es";

      // Resolve "today" in the team's timezone
      const nowInTz = new Date().toLocaleString("en-CA", { timeZone: timezone });
      const [datePart] = nowInTz.split(",");
      const [, month, day] = datePart.trim().split("-"); // en-CA gives YYYY-MM-DD
      const todayMMDD = `${month}-${day}`;
      const yearStr = datePart.trim().split("-")[0];

      // Quiet hours check (in team timezone)
      const currentHourInTz = parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "2-digit",
          hour12: false,
        }).formatToParts(new Date()).find((p) => p.type === "hour")?.value || "0",
      );

      if (isInQuietHours(currentHourInTz, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)) {
        log.debug("Skipping team due to quiet hours", { teamId: team._id, currentHourInTz });
        continue;
      }

      // Load team SMS config
      const smsConfigDoc = await ctx.runQuery(internal.smsConfig.getByTeamId, {
        teamId: team._id,
      });
      const teamSmsConfig: TeamSmsConfig | null = smsConfigDoc
        ? {
            provider: smsConfigDoc.provider,
            isEnabled: smsConfigDoc.isEnabled,
            webhookUrl: smsConfigDoc.webhookUrl,
            fromNumber: smsConfigDoc.fromNumber,
            credentialsEnvPrefix: smsConfigDoc.credentialsEnvPrefix,
          }
        : null;

      const patients = await ctx.runQuery(internal.proReminders.getPatientsWithBirthday, {
        teamId: team._id,
        todayMMDD,
      });

      for (const patient of patients) {
        // Idempotency: check if already sent this year
        const existing = await ctx.runQuery(internal.proReminders.getBirthdayReminderForYear, {
          patientId: patient._id,
          yearStr,
        });

        if (existing) {
          totalSkipped++;
          continue;
        }

        const message = formatBirthdayMessage(patient.name || null, languageMode);
        const result = await sendSMSWebhookDetailed(patient.phone, message, teamSmsConfig);

        if (result.ok) {
          await ctx.runMutation(internal.reminders.recordReminderSent, {
            patientId: patient._id,
            reminderType: "birthday",
            targetDate: yearStr,
            teamId: team._id,
          });

          // Log to conversation
          try {
            await ctx.runMutation(internal.messages.createSystemMessageInternal, {
              teamId: team._id,
              patientId: patient._id,
              phone: patient.phone,
              body: message,
              messageType: "birthday_greeting",
              status: "sent",
            });
          } catch (logErr) {
            log.error("Failed to log birthday message to conversation", logErr);
          }

          totalSent++;
          log.info("Sent birthday reminder", { patientId: patient._id, teamId: team._id });
        } else {
          log.error("Birthday SMS failed", {
            patientId: patient._id,
            teamId: team._id,
            failureReason: result.failureReason,
          });
        }
      }
    }

    log.info("Birthday reminder check complete", { totalSent, totalSkipped });
  },
});

// ---------------------------------------------------------------------------
// Internal queries used by the return-date action
// ---------------------------------------------------------------------------

/**
 * Return patients whose recommendedReturnDate is exactly `targetDate` (YYYY-MM-DD).
 */
export const getPatientsWithReturnDate = internalQuery({
  args: {
    teamId: v.id("teams"),
    targetDate: v.string(),
  },
  handler: async (ctx, args) => {
    const patients = await ctx.db
      .query("patients")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("recommendedReturnDate"), args.targetDate))
      .collect();
    return patients;
  },
});

/**
 * Check if a return-date reminder was already sent for a specific patient + date + type.
 */
export const getReturnDateReminder = internalQuery({
  args: {
    patientId: v.id("patients"),
    reminderType: v.string(),
    targetDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reminders")
      .withIndex("by_patient_type_date", (q) =>
        q
          .eq("patientId", args.patientId)
          .eq("reminderType", args.reminderType)
          .eq("targetDate", args.targetDate),
      )
      .first();
  },
});

/**
 * Check whether a patient has any active (non-cancelled) appointment on or after `sinceDate`.
 */
export const hasUpcomingAppointment = internalQuery({
  args: {
    patientId: v.id("patients"),
    teamId: v.id("teams"),
    sinceDate: v.string(),
  },
  handler: async (ctx, args) => {
    const appt = await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), args.patientId),
          q.neq(q.field("status"), "cancelled"),
          q.gte(q.field("dateTime"), args.sinceDate),
        ),
      )
      .first();
    return appt !== null;
  },
});

// ---------------------------------------------------------------------------
// Return-date reminder action
// ---------------------------------------------------------------------------

/**
 * Daily action: look for patients whose recommendedReturnDate is 30 or 7 days
 * from today (in the team's timezone) and send an SMS with a scheduling link.
 *
 * 30-day reminder: always sent (if not already).
 * 7-day reminder: only sent if the patient has no scheduled appointment on or
 * after the return date.
 */
export const checkAndSendReturnDateReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const log = createActionLogger("proReminders.checkAndSendReturnDateReminders");
    log.info("Starting return-date reminder check");

    const teams: Doc<"teams">[] = await ctx.runQuery(internal.proReminders.getAllTeams, {});
    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://app.smovr.com";

    let totalSent = 0;
    let totalSkipped = 0;

    for (const team of teams) {
      const timezone = team.timezone || "America/Los_Angeles";
      const languageMode: LanguageMode = (team.languageMode as LanguageMode) ?? "en_es";

      // Resolve "today" in the team's timezone (YYYY-MM-DD)
      const nowInTz = new Date().toLocaleString("en-CA", { timeZone: timezone });
      const [datePart] = nowInTz.split(",");
      const todayISO = datePart.trim();

      // Quiet hours check
      const currentHourInTz = parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "2-digit",
          hour12: false,
        }).formatToParts(new Date()).find((p) => p.type === "hour")?.value || "0",
      );

      if (isInQuietHours(currentHourInTz, DEFAULT_QUIET_HOURS_START, DEFAULT_QUIET_HOURS_END)) {
        log.debug("Skipping team due to quiet hours", { teamId: team._id, currentHourInTz });
        continue;
      }

      const schedulingLink = getSchedulingLink(team, baseUrl);

      // Load team SMS config
      const smsConfigDoc = await ctx.runQuery(internal.smsConfig.getByTeamId, {
        teamId: team._id,
      });
      const teamSmsConfig: TeamSmsConfig | null = smsConfigDoc
        ? {
            provider: smsConfigDoc.provider,
            isEnabled: smsConfigDoc.isEnabled,
            webhookUrl: smsConfigDoc.webhookUrl,
            fromNumber: smsConfigDoc.fromNumber,
            credentialsEnvPrefix: smsConfigDoc.credentialsEnvPrefix,
          }
        : null;

      // Compute target dates: 30 days and 7 days from today
      const today = new Date(`${todayISO}T00:00:00`);
      const in30 = new Date(today);
      in30.setDate(in30.getDate() + 30);
      const in7 = new Date(today);
      in7.setDate(in7.getDate() + 7);
      const target30 = in30.toISOString().split("T")[0];
      const target7 = in7.toISOString().split("T")[0];

      // --- 30-day reminders ---
      const patients30 = await ctx.runQuery(internal.proReminders.getPatientsWithReturnDate, {
        teamId: team._id,
        targetDate: target30,
      });

      for (const patient of patients30) {
        const existing = await ctx.runQuery(internal.proReminders.getReturnDateReminder, {
          patientId: patient._id,
          reminderType: "return_30d",
          targetDate: target30,
        });
        if (existing) { totalSkipped++; continue; }

        const link = schedulingLink || "";
        const message = formatReturnDateMessage(patient.name || null, link, languageMode);
        const result = await sendSMSWebhookDetailed(patient.phone, message, teamSmsConfig);

        if (result.ok) {
          await ctx.runMutation(internal.reminders.recordReminderSent, {
            patientId: patient._id,
            reminderType: "return_30d",
            targetDate: target30,
            teamId: team._id,
          });
          try {
            await ctx.runMutation(internal.messages.createSystemMessageInternal, {
              teamId: team._id,
              patientId: patient._id,
              phone: patient.phone,
              body: message,
              messageType: "return_date_reminder",
              status: "sent",
            });
          } catch (logErr) {
            log.error("Failed to log return-date message to conversation", logErr);
          }
          totalSent++;
          log.info("Sent 30d return-date reminder", { patientId: patient._id, teamId: team._id });
        } else {
          log.error("30d return-date SMS failed", { patientId: patient._id, failureReason: result.failureReason });
        }
      }

      // --- 7-day reminders (only if no upcoming appointment) ---
      const patients7 = await ctx.runQuery(internal.proReminders.getPatientsWithReturnDate, {
        teamId: team._id,
        targetDate: target7,
      });

      for (const patient of patients7) {
        const existing = await ctx.runQuery(internal.proReminders.getReturnDateReminder, {
          patientId: patient._id,
          reminderType: "return_7d",
          targetDate: target7,
        });
        if (existing) { totalSkipped++; continue; }

        const hasAppt = await ctx.runQuery(internal.proReminders.hasUpcomingAppointment, {
          patientId: patient._id,
          teamId: team._id,
          sinceDate: target7,
        });
        if (hasAppt) {
          totalSkipped++;
          log.debug("Skipping 7d reminder — patient has upcoming appointment", { patientId: patient._id });
          continue;
        }

        const link = schedulingLink || "";
        const message = formatReturnDateMessage(patient.name || null, link, languageMode);
        const result = await sendSMSWebhookDetailed(patient.phone, message, teamSmsConfig);

        if (result.ok) {
          await ctx.runMutation(internal.reminders.recordReminderSent, {
            patientId: patient._id,
            reminderType: "return_7d",
            targetDate: target7,
            teamId: team._id,
          });
          try {
            await ctx.runMutation(internal.messages.createSystemMessageInternal, {
              teamId: team._id,
              patientId: patient._id,
              phone: patient.phone,
              body: message,
              messageType: "return_date_reminder",
              status: "sent",
            });
          } catch (logErr) {
            log.error("Failed to log return-date message to conversation", logErr);
          }
          totalSent++;
          log.info("Sent 7d return-date reminder", { patientId: patient._id, teamId: team._id });
        } else {
          log.error("7d return-date SMS failed", { patientId: patient._id, failureReason: result.failureReason });
        }
      }
    }

    log.info("Return-date reminder check complete", { totalSent, totalSkipped });
  },
});

// ---------------------------------------------------------------------------
// Referral follow-up action
// ---------------------------------------------------------------------------

/**
 * Sends follow-up SMS for a single referral. Called immediately (delay=0) from
 * the API route, or by the scheduled cron for delayed follow-ups.
 */
export const sendReferralFollowUp = internalAction({
  args: { referralId: v.id("referrals") },
  handler: async (ctx, args) => {
    const log = createActionLogger("proReminders.sendReferralFollowUp");

    const referral = await ctx.runQuery(internal.proReminders.getReferralById, {
      referralId: args.referralId,
    });
    if (!referral) {
      log.error("Referral not found", { referralId: args.referralId });
      return;
    }
    if (referral.followUpSentAt) {
      log.debug("Follow-up already sent", { referralId: referral._id });
      return;
    }

    const team = await ctx.runQuery(internal.proReminders.getTeamById, { teamId: referral.teamId });
    const patient = await ctx.runQuery(internal.proReminders.getPatientById, { patientId: referral.patientId });
    if (!patient) {
      log.error("Patient not found for referral", { referralId: referral._id });
      return;
    }

    const languageMode: LanguageMode = (team?.languageMode as LanguageMode) ?? "en_es";
    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://app.smovr.com";
    const statusLink = `${baseUrl}/referral-status/${referral.token}`;

    const message = formatReferralFollowUpMessage(patient.name || null, statusLink, languageMode);

    const smsConfigDoc = await ctx.runQuery(internal.smsConfig.getByTeamId, {
      teamId: referral.teamId,
    });
    const teamSmsConfig: TeamSmsConfig | null = smsConfigDoc
      ? {
          provider: smsConfigDoc.provider,
          isEnabled: smsConfigDoc.isEnabled,
          webhookUrl: smsConfigDoc.webhookUrl,
          fromNumber: smsConfigDoc.fromNumber,
          credentialsEnvPrefix: smsConfigDoc.credentialsEnvPrefix,
        }
      : null;

    const result = await sendSMSWebhookDetailed(patient.phone, message, teamSmsConfig);

    if (result.ok) {
      await ctx.runMutation(internal.referrals.markFollowUpSent, {
        referralId: referral._id,
      });

      try {
        await ctx.runMutation(internal.messages.createSystemMessageInternal, {
          teamId: referral.teamId,
          patientId: referral.patientId,
          phone: patient.phone,
          body: message,
          messageType: "referral_follow_up",
          status: "sent",
        });
      } catch (logErr) {
        log.error("Failed to log referral follow-up to conversation", logErr);
      }

      log.info("Sent referral follow-up", { referralId: referral._id, patientId: patient._id });
    } else {
      log.error("Referral follow-up SMS failed", {
        referralId: referral._id,
        failureReason: result.failureReason,
      });
    }
  },
});

/**
 * Cron action: check for referrals whose follow-up delay has elapsed and
 * send the follow-up SMS.
 */
export const checkAndSendReferralFollowUps = internalAction({
  args: {},
  handler: async (ctx) => {
    const log = createActionLogger("proReminders.checkAndSendReferralFollowUps");
    log.info("Starting referral follow-up check");

    const pending = await ctx.runQuery(internal.referrals.getPendingFollowUps, {});
    log.info("Found pending referral follow-ups", { count: pending.length });

    let sent = 0;
    for (const referral of pending) {
      try {
        await ctx.runAction(internal.proReminders.sendReferralFollowUp, {
          referralId: referral._id,
        });
        sent++;
      } catch (err) {
        log.error("Failed to send referral follow-up", {
          referralId: referral._id,
          error: String(err),
        });
      }
    }

    log.info("Referral follow-up check complete", { sent, total: pending.length });
  },
});

// Helper queries for the referral follow-up action

export const getReferralById = internalQuery({
  args: { referralId: v.id("referrals") },
  handler: async (ctx, args) => ctx.db.get(args.referralId),
});

export const getTeamById = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => ctx.db.get(args.teamId),
});

export const getPatientById = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => ctx.db.get(args.patientId),
});

export const getPatientByIdForTeam = internalQuery({
  args: {
    patientId: v.id("patients"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient || patient.teamId !== args.teamId) {
      return null;
    }
    return patient;
  },
});

// ---------------------------------------------------------------------------
// Lapsed patient reactivation action
// ---------------------------------------------------------------------------

/**
 * Send a reactivation message to one or more patients.
 * Called from the staff dashboard bulk action.
 */
export const sendReactivationMessages = internalAction({
  args: {
    teamId: v.id("teams"),
    patientIds: v.array(v.id("patients")),
  },
  handler: async (ctx, args) => {
    const log = createActionLogger("proReminders.sendReactivationMessages");
    log.info("Starting reactivation send", { teamId: args.teamId, count: args.patientIds.length });

    const team = await ctx.runQuery(internal.proReminders.getTeamById, { teamId: args.teamId });
    if (!team) {
      log.error("Team not found", { teamId: args.teamId });
      return { sent: 0, failed: 0 };
    }

    const languageMode: LanguageMode = (team.languageMode as LanguageMode) ?? "en_es";
    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://app.smovr.com";
    const schedulingLink = getSchedulingLink(team, baseUrl) || "";

    const smsConfigDoc = await ctx.runQuery(internal.smsConfig.getByTeamId, {
      teamId: args.teamId,
    });
    const teamSmsConfig: TeamSmsConfig | null = smsConfigDoc
      ? {
          provider: smsConfigDoc.provider,
          isEnabled: smsConfigDoc.isEnabled,
          webhookUrl: smsConfigDoc.webhookUrl,
          fromNumber: smsConfigDoc.fromNumber,
          credentialsEnvPrefix: smsConfigDoc.credentialsEnvPrefix,
        }
      : null;

    let sent = 0;
    let failed = 0;

    for (const patientId of args.patientIds) {
      const patient = await ctx.runQuery(internal.proReminders.getPatientByIdForTeam, {
        patientId,
        teamId: args.teamId,
      });
      if (!patient) {
        log.warn("Patient not found in team, skipping", { patientId, teamId: args.teamId });
        failed++;
        continue;
      }

      const message = formatReactivationMessage(patient.name || null, schedulingLink, languageMode);
      const result = await sendSMSWebhookDetailed(patient.phone, message, teamSmsConfig);

      if (result.ok) {
        try {
          await ctx.runMutation(internal.messages.createSystemMessageInternal, {
            teamId: args.teamId,
            patientId,
            phone: patient.phone,
            body: message,
            messageType: "reactivation",
            status: "sent",
          });
        } catch (logErr) {
          log.error("Failed to log reactivation message to conversation", logErr);
        }

        // Log as audit event
        try {
          await ctx.runMutation(internal.proReminders.logReactivationSent, {
            patientId,
            teamId: args.teamId,
          });
        } catch (logErr) {
          log.error("Failed to log reactivation audit event", logErr);
        }

        sent++;
        log.info("Sent reactivation", { patientId });
      } else {
        log.error("Reactivation SMS failed", { patientId, failureReason: result.failureReason });
        failed++;
      }
    }

    log.info("Reactivation send complete", { sent, failed });
    return { sent, failed };
  },
});

export const logReactivationSent = internalMutation({
  args: {
    patientId: v.id("patients"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("logs", {
      patientId: args.patientId,
      teamId: args.teamId,
      action: "reactivation_sent",
      message: "Reactivation message sent to patient",
      timestamp: new Date().toISOString(),
    });
  },
});
