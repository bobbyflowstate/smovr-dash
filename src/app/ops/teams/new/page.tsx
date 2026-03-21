"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEATURE_FLAGS } from "../../../../../convex/lib/featureFlags";

const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function NewTeamPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [timezone, setTimezone] = useState("");
  const [languageMode, setLanguageMode] = useState<"en" | "en_es">("en_es");
  const [rescheduleUrl, setRescheduleUrl] = useState("");
  const [entrySlug, setEntrySlug] = useState("");

  const [features, setFeatures] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.entries(FEATURE_FLAGS).map(([key, flag]) => [key, flag.default])
    )
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Team name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        contactPhone: contactPhone.trim() || undefined,
        hospitalAddress: hospitalAddress.trim() || undefined,
        timezone: timezone || undefined,
        languageMode,
        rescheduleUrl: rescheduleUrl.trim() || undefined,
        entrySlug: entrySlug.trim() || undefined,
        features,
      };

      const res = await fetch("/api/ops/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create team");
      }

      await res.json();
      router.push("/ops");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (key: string) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">Create New Team</h1>

      {error && (
        <div className="bg-red-900/40 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* General */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Team Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Address
              </label>
              <input
                type="text"
                value={hospitalAddress}
                onChange={(e) => setHospitalAddress(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Language Mode
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="en"
                    checked={languageMode === "en"}
                    onChange={() => setLanguageMode("en")}
                    className="text-blue-500 focus:ring-blue-500 bg-gray-800 border-gray-700"
                  />
                  <span className="text-sm text-gray-300">English</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="en_es"
                    checked={languageMode === "en_es"}
                    onChange={() => setLanguageMode("en_es")}
                    className="text-blue-500 focus:ring-blue-500 bg-gray-800 border-gray-700"
                  />
                  <span className="text-sm text-gray-300">
                    English + Spanish
                  </span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Links */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Links</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Reschedule URL
              </label>
              <input
                type="url"
                value={rescheduleUrl}
                onChange={(e) => setRescheduleUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Entry Slug (Public Link ID)
              </label>
              <input
                type="text"
                value={entrySlug}
                onChange={(e) =>
                  setEntrySlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                  )
                }
                placeholder="my-clinic"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Used for /book/[slug] and /chat/[slug] public URLs.
              </p>
            </div>
          </div>
        </section>

        {/* Feature Flags */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Features</h2>
          <div className="space-y-3">
            {Object.entries(FEATURE_FLAGS).map(([key, flag]) => (
              <label
                key={key}
                className="flex items-center justify-between py-2 cursor-pointer"
              >
                <span className="text-sm text-gray-300">{flag.label}</span>
                <button
                  type="button"
                  onClick={() => toggleFeature(key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    features[key] ? "bg-blue-600" : "bg-gray-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      features[key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/ops")}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? "Creating..." : "Create Team"}
          </button>
        </div>
      </form>
    </div>
  );
}
