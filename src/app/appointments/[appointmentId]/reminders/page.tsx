"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { APPOINTMENT_TIMEZONE, getTimezoneDisplayName } from "@/lib/timezone-utils";
import { REMINDER_WINDOWS_HOURS } from "../../../../../convex/reminder_logic";

type ReminderAttempt = {
  _id: string;
  attemptedAt: string;
  reminderType: string;
  status: string;
  reasonCode: string;
  note: string;
  detailsJson?: string;
};

type AppointmentInfo = {
  _id: string;
  dateTime: string;
  notes: string | null;
  patientId: string;
  teamId: string;
};

type PatientInfo = {
  _id: string;
  name: string | null;
  phone: string;
} | null;

type ExpectedReminderRow = {
  reminderType: "24h" | "1h";
  windowStart: Date;
  windowEnd: Date;
  summary: string;
  expectedBehavior: string;
};

const QUIET_HOURS_START = 22; // 10pm
const QUIET_HOURS_END = 5; // 5am

function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value || "0";
  return parseInt(hour, 10);
}

function isInQuietHoursAt(args: {
  date: Date;
  timezone: string;
  quietStart: number;
  quietEnd: number;
}): boolean {
  const h = getHourInTimezone(args.date, args.timezone);
  if (args.quietStart <= args.quietEnd) {
    return h >= args.quietStart && h < args.quietEnd;
  }
  return h >= args.quietStart || h < args.quietEnd;
}

function intervalHasNonQuietTime(args: {
  start: Date;
  end: Date;
  timezone: string;
  quietStart: number;
  quietEnd: number;
}): boolean {
  const startMs = args.start.getTime();
  const endMs = args.end.getTime();
  if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return false;

  // Sample on 15-minute boundaries (automated check cadence) + also check start/end.
  const stepMs = 15 * 60 * 1000;
  for (let t = startMs; t <= endMs; t += stepMs) {
    const d = new Date(t);
    if (
      !isInQuietHoursAt({
        date: d,
        timezone: args.timezone,
        quietStart: args.quietStart,
        quietEnd: args.quietEnd,
      })
    ) {
      return true;
    }
  }
  if (
    !isInQuietHoursAt({
      date: args.start,
      timezone: args.timezone,
      quietStart: args.quietStart,
      quietEnd: args.quietEnd,
    })
  ) {
    return true;
  }
  if (
    !isInQuietHoursAt({
      date: args.end,
      timezone: args.timezone,
      quietStart: args.quietStart,
      quietEnd: args.quietEnd,
    })
  ) {
    return true;
  }
  return false;
}

export default function ReminderAttemptsPage() {
  const params = useParams();
  const appointmentId = params.appointmentId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState<ReminderAttempt[]>([]);
  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [patient, setPatient] = useState<PatientInfo>(null);
  const [expectedRows, setExpectedRows] = useState<ExpectedReminderRow[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");
        const [attemptsRes, apptRes] = await Promise.all([
          fetch(`/api/reminder-attempts/${appointmentId}?limit=200`),
          fetch(`/api/appointments/${appointmentId}`),
        ]);

        const attemptsData = await attemptsRes.json().catch(() => ({}));
        const apptData = await apptRes.json().catch(() => ({}));

        if (!attemptsRes.ok) {
          throw new Error(
            attemptsData?.error || `Failed to load reminder attempts (${attemptsRes.status})`
          );
        }
        if (!apptRes.ok) {
          throw new Error(apptData?.error || `Failed to load appointment (${apptRes.status})`);
        }

        setAttempts(attemptsData?.attempts || []);
        setAppointment(apptData?.appointment || null);
        setPatient(apptData?.patient || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load reminder attempts");
      } finally {
        setLoading(false);
      }
    };
    if (appointmentId) fetchData();
  }, [appointmentId]);

  const formatLocal = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatInClinicTimezone = (date: Date) => {
    if (isNaN(date.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: APPOINTMENT_TIMEZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  useEffect(() => {
    if (!appointment?.dateTime) {
      setExpectedRows([]);
      return;
    }

    const apptDate = new Date(appointment.dateTime);
    const now = new Date();
    if (isNaN(apptDate.getTime())) {
      setExpectedRows([]);
      return;
    }

    const latestByType = (type: "24h" | "1h") => {
      const rows = attempts
        .filter((a) => a.reminderType === type)
        .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime());
      return rows[0] || null;
    };

    const buildRow = (type: "24h" | "1h"): ExpectedReminderRow => {
      const w = REMINDER_WINDOWS_HOURS[type];
      // Cron considers reminders eligible when "hoursUntil" is in [startInclusive, endExclusive).
      // That corresponds to now being in [appt - endExclusive, appt - startInclusive].
      const windowStart = new Date(apptDate.getTime() - w.endExclusive * 60 * 60 * 1000);
      const windowEnd = new Date(apptDate.getTime() - w.startInclusive * 60 * 60 * 1000);

      const latest = latestByType(type);
      const hasSucceeded = Boolean(latest && latest.status === "succeeded");
      const inWindowNow = now >= windowStart && now <= windowEnd;
      const windowPassed = now > windowEnd;
      const windowInFuture = now < windowStart;

      const anyNonQuiet = intervalHasNonQuietTime({
        start: windowStart,
        end: windowEnd,
        timezone: APPOINTMENT_TIMEZONE,
        quietStart: QUIET_HOURS_START,
        quietEnd: QUIET_HOURS_END,
      });

      let expectedBehavior = "";
      if (hasSucceeded) {
        expectedBehavior = "Already sent (succeeded).";
      } else if (latest) {
        expectedBehavior = `Latest status: ${latest.status} (${latest.reasonCode}).`;
      } else if (windowInFuture) {
        expectedBehavior = "Not attempted yet (window has not started).";
      } else if (inWindowNow) {
        expectedBehavior = "In window now: should attempt on the next automated check.";
      } else if (windowPassed) {
        expectedBehavior =
          "This reminder window has ended. If no attempts are shown, the appointment was likely created after this window (or the reminder was intentionally skipped due to booking confirmation or quiet hours).";
      }

      if (!anyNonQuiet) {
        expectedBehavior +=
          " Note: this window is entirely during quiet hours, so it will likely never send.";
      }

      const summary =
        type === "24h"
          ? '“Day-before” reminder (24h)'
          : '“One-hour” reminder (1h)';

      return { reminderType: type, windowStart, windowEnd, summary, expectedBehavior };
    };

    setExpectedRows([buildRow("24h"), buildRow("1h")]);
  }, [appointment?.dateTime, attempts]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reminder Attempts
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 break-all">
              Appointment ID: <span className="font-mono">{appointmentId}</span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Quiet hours: <span className="font-semibold">10pm–5am</span> ({getTimezoneDisplayName(APPOINTMENT_TIMEZONE)})
            </p>
          </div>
          <Link
            href="/appointments"
            className="inline-flex items-center px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
          >
            Back
          </Link>
        </div>
      </div>

      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <p className="text-gray-600 dark:text-gray-400">Loading reminder attempts...</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Expected reminders (even if nothing has happened yet) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Expected reminders
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Times shown in {getTimezoneDisplayName(APPOINTMENT_TIMEZONE)}. The system checks about every minute.
              </p>
              {appointment?.dateTime && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Appointment time:{" "}
                  <span className="font-semibold">
                    {formatInClinicTimezone(new Date(appointment.dateTime))}
                  </span>
                  {patient?.name || patient?.phone ? (
                    <>
                      {" "}
                      — Patient:{" "}
                      <span className="font-semibold">
                        {patient?.name ? patient.name : patient?.phone}
                      </span>
                    </>
                  ) : null}
                </p>
              )}
            </div>

            {expectedRows.length === 0 ? (
              <div className="p-8">
                <p className="text-gray-600 dark:text-gray-400">
                  Unable to compute expected reminders (missing appointment time).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Send window (start → end)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        What to expect
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {expectedRows.map((r) => (
                      <tr key={r.reminderType} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          <div className="font-semibold">{r.summary}</div>
                          <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
                            {r.reminderType}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          <div className="font-mono">
                            {formatInClinicTimezone(r.windowStart)} → {formatInClinicTimezone(r.windowEnd)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {r.expectedBehavior}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Attempt history */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Attempt history
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Every attempt/skip/failure is recorded so you can explain what happened.
              </p>
            </div>
            {attempts.length === 0 ? (
              <div className="p-8">
                <p className="text-gray-600 dark:text-gray-400">
                  No reminder attempts recorded yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Attempted at
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Reason
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Note
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {attempts.map((a) => (
                      <tr key={a._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          {formatLocal(a.attemptedAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-300">
                          {a.reminderType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          {a.status}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600 dark:text-gray-400">
                          {a.reasonCode}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {a.note}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {a.detailsJson ? (
                            <details className="cursor-pointer">
                              <summary className="text-blue-600 dark:text-blue-400">View</summary>
                              <pre className="mt-2 text-xs whitespace-pre-wrap break-all bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                                {a.detailsJson}
                              </pre>
                            </details>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

