"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface TeamSettings {
  _id: string;
  name: string;
  contactPhone?: string;
  timezone?: string;
  hospitalAddress?: string;
  languageMode: "en" | "en_es";
  rescheduleUrl?: string;
  entrySlug?: string;
}

const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [languageMode, setLanguageMode] = useState<"en" | "en_es">("en_es");
  const [rescheduleUrl, setRescheduleUrl] = useState("");
  const [entrySlug, setEntrySlug] = useState("");
  const [savedEntrySlug, setSavedEntrySlug] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settings");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch settings (${res.status})`);
      }
      const data: TeamSettings = await res.json();
      setName(data.name ?? "");
      setContactPhone(data.contactPhone ?? "");
      setTimezone(data.timezone ?? "");
      setHospitalAddress(data.hospitalAddress ?? "");
      setLanguageMode(data.languageMode ?? "en_es");
      setRescheduleUrl(data.rescheduleUrl ?? "");
      setEntrySlug(data.entrySlug ?? "");
      setSavedEntrySlug(data.entrySlug ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const bookingUrl = useMemo(() => {
    if (!entrySlug) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/book/${entrySlug}`;
  }, [entrySlug]);
  const chatUrl = useMemo(() => {
    if (!entrySlug) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/chat/${entrySlug}`;
  }, [entrySlug]);
  const isPublicLinkIdLocked = savedEntrySlug.trim().length > 0;

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Team name is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contactPhone: contactPhone.trim(),
          timezone: timezone || undefined,
          hospitalAddress: hospitalAddress.trim(),
          languageMode,
          rescheduleUrl: rescheduleUrl.trim(),
          entrySlug: entrySlug.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }

      setSuccessMessage("Settings saved");
      setTimeout(() => setSuccessMessage(null), 2500);
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const copyBookingUrl = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setSuccessMessage("Appointment request link copied");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch {
      setError("Could not copy appointment request link");
    }
  };

  const copyChatUrl = async () => {
    if (!chatUrl) return;
    try {
      await navigator.clipboard.writeText(chatUrl);
      setSuccessMessage("Chat link copied");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch {
      setError("Could not copy chat link");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage team configuration.</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-4 rounded-lg mb-6">
            {successMessage}
          </div>
        )}

        <div className="space-y-6">
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">General</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select timezone...</option>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Hospital Address
                </label>
                <input
                  type="text"
                  value={hospitalAddress}
                  onChange={(e) => setHospitalAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Messaging</h2>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="en"
                  checked={languageMode === "en"}
                  onChange={() => setLanguageMode("en")}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">English</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="en_es"
                  checked={languageMode === "en_es"}
                  onChange={() => setLanguageMode("en_es")}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">English + Spanish</span>
              </label>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Links</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reschedule URL
                </label>
                <input
                  type="url"
                  value={rescheduleUrl}
                  onChange={(e) => setRescheduleUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Public Link ID
                </label>
                <input
                  type="text"
                  value={entrySlug}
                  onChange={(e) =>
                    setEntrySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  disabled={isPublicLinkIdLocked}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
                {isPublicLinkIdLocked ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    This ID is locked after setup to keep existing patient links working.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Pick carefully. This can only be set once.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Patient Links</h2>
            {!bookingUrl ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Set a Public Link ID above, save settings, then copy your patient-facing links here.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                    Appointment Request Link
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs px-2 py-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
                      {bookingUrl}
                    </code>
                    <button
                      type="button"
                      onClick={copyBookingUrl}
                      className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                    Chat Link
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs px-2 py-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
                      {chatUrl}
                    </code>
                    <button
                      type="button"
                      onClick={copyChatUrl}
                      className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
