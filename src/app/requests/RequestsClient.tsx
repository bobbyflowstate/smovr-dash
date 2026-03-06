"use client";

import { useState, useEffect, useCallback } from "react";
import { formatPhoneForDisplay } from "@/lib/phone-utils";

type StatusFilter = "pending" | "scheduled" | "dismissed" | "all";

interface SchedulingRequest {
  _id: string;
  patientName?: string;
  patientPhone: string;
  source: "booking_page" | "website_button" | "reactivation";
  status: "pending" | "scheduled" | "dismissed";
  notes?: string;
  createdAt: string;
  resolvedAt?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  booking_page: "Booking Page",
  website_button: "Website Button",
  reactivation: "Reactivation",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  scheduled: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  dismissed: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

export default function RequestsClient() {
  const [requests, setRequests] = useState<SchedulingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchRequests = useCallback(async () => {
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/requests${params}`);
      if (!res.ok) throw new Error("Failed to fetch requests");
      const data = await res.json();
      setRequests(data);
      setError("");
    } catch (err) {
      console.error("Error fetching scheduling requests:", err);
      setError("Failed to load scheduling requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchRequests();
  }, [fetchRequests]);

  async function handleResolve(requestId: string, status: "scheduled" | "dismissed") {
    setResolving(requestId);
    try {
      const res = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to resolve request");
      }
      await fetchRequests();
    } catch (err) {
      console.error("Error resolving scheduling request:", err);
      setError(err instanceof Error ? err.message : "Failed to resolve request");
    } finally {
      setResolving(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Scheduling Requests
        </h1>
        <div className="flex gap-2">
          {(["pending", "all", "scheduled", "dismissed"] as StatusFilter[]).map((f) => (
            <button
              key={f}
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">Loading requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            No {filter !== "all" ? filter : ""} scheduling requests
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Requests from the booking page will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Submitted</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {requests.map((req) => (
                <tr key={req._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {req.patientName || "—"}
                    </span>
                    {req.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[200px]" title={req.notes}>
                        {req.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {formatPhoneForDisplay(req.patientPhone) || req.patientPhone}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {SOURCE_LABELS[req.source] || req.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[req.status]}`}>
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
                          onClick={() => handleResolve(req._id, "scheduled")}
                          disabled={resolving === req._id}
                          className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-md transition-colors"
                        >
                          {resolving === req._id ? "..." : "Schedule"}
                        </button>
                        <button
                          onClick={() => handleResolve(req._id, "dismissed")}
                          disabled={resolving === req._id}
                          className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 rounded-md transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {req.resolvedAt ? formatDate(req.resolvedAt) : "—"}
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
