"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPhoneForDisplay } from "@/lib/phone-utils";

type StatusFilter = "pending" | "scheduled" | "dismissed" | "all";

type SchedulingRequest = {
  _id: string;
  patientName?: string;
  patientPhone: string;
  source: "booking_page" | "website_button" | "reactivation";
  status: "pending" | "scheduled" | "dismissed";
  notes?: string;
  createdAt: string;
  resolvedAt?: string;
};

const SOURCE_LABELS: Record<SchedulingRequest["source"], string> = {
  booking_page: "Booking Page",
  website_button: "Website Button",
  reactivation: "Reactivation",
};

const STATUS_STYLES: Record<SchedulingRequest["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  scheduled: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  dismissed: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

export default function RequestsClient() {
  const [requests, setRequests] = useState<SchedulingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const fetchRequests = useCallback(async () => {
    try {
      const params = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/requests${params}`);
      if (!res.ok) throw new Error("Failed to fetch requests");
      const data = (await res.json()) as SchedulingRequest[];
      setRequests(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void fetchRequests();
  }, [fetchRequests]);

  const handleResolve = async (requestId: string, status: "scheduled" | "dismissed") => {
    try {
      setResolving(requestId);
      const res = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to resolve request");
      }
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve request");
    } finally {
      setResolving(null);
    }
  };

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Scheduling Requests</h1>
        <div className="flex gap-2">
          {(["pending", "all", "scheduled", "dismissed"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">Loading requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            No {filter !== "all" ? filter : ""} requests
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Patient
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Phone
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Source
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Submitted
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {requests.map((req) => (
                <tr key={req._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {req.patientName || "Unknown"}
                    {req.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{req.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {formatPhoneForDisplay(req.patientPhone) || req.patientPhone}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                    {SOURCE_LABELS[req.source]}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_STYLES[req.status]}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(req.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.status === "pending" ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          disabled={resolving === req._id}
                          onClick={() => handleResolve(req._id, "scheduled")}
                          className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-md"
                        >
                          {resolving === req._id ? "..." : "Schedule"}
                        </button>
                        <button
                          type="button"
                          disabled={resolving === req._id}
                          onClick={() => handleResolve(req._id, "dismissed")}
                          className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {req.resolvedAt ? formatDate(req.resolvedAt) : "Resolved"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
