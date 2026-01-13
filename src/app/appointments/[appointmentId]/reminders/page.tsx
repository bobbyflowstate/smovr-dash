"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type ReminderAttempt = {
  _id: string;
  attemptedAt: string;
  reminderType: string;
  status: string;
  reasonCode: string;
  note: string;
  detailsJson?: string;
};

export default function ReminderAttemptsPage() {
  const params = useParams();
  const appointmentId = params.appointmentId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState<ReminderAttempt[]>([]);

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`/api/reminder-attempts/${appointmentId}?limit=200`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || `Failed to load reminder attempts (${res.status})`);
        }
        setAttempts(data?.attempts || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load reminder attempts");
      } finally {
        setLoading(false);
      }
    };
    if (appointmentId) fetchAttempts();
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors overflow-hidden">
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
      )}
    </div>
  );
}

