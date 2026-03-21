"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

interface TeamDetail {
  _id: string;
  name: string;
  contactPhone?: string;
  timezone?: string;
  hospitalAddress?: string;
  languageMode?: string;
  rescheduleUrl?: string;
  entrySlug?: string;
  features?: Record<string, boolean>;
  isArchived?: boolean;
  archivedAt?: string;
}

interface TeamUser {
  _id: string;
  name?: string;
  email?: string;
  clinicRole?: string;
}

interface AllUser {
  _id: string;
  name?: string;
  email?: string;
  teamId?: string;
  clinicRole?: string;
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [timezone, setTimezone] = useState("");
  const [languageMode, setLanguageMode] = useState<"en" | "en_es">("en_es");
  const [rescheduleUrl, setRescheduleUrl] = useState("");
  const [entrySlug, setEntrySlug] = useState("");
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const loadTeam = useCallback(async () => {
    try {
      setLoading(true);
      const [teamRes, usersRes] = await Promise.all([
        fetch(`/api/ops/teams/${teamId}`),
        fetch(`/api/ops/teams/${teamId}/users`),
      ]);

      if (!teamRes.ok) {
        if (teamRes.status === 404) {
          router.push("/ops");
          return;
        }
        throw new Error("Failed to load team");
      }

      const teamData: TeamDetail = await teamRes.json();
      setTeam(teamData);
      setName(teamData.name);
      setContactPhone(teamData.contactPhone ?? "");
      setHospitalAddress(teamData.hospitalAddress ?? "");
      setTimezone(teamData.timezone ?? "");
      setLanguageMode((teamData.languageMode as "en" | "en_es") ?? "en_es");
      setRescheduleUrl(teamData.rescheduleUrl ?? "");
      setEntrySlug(teamData.entrySlug ?? "");

      const flagState: Record<string, boolean> = {};
      for (const [key, flag] of Object.entries(FEATURE_FLAGS)) {
        flagState[key] = teamData.features?.[key] ?? flag.default;
      }
      setFeatures(flagState);

      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, [teamId, router]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Team name is required");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        contactPhone: contactPhone.trim(),
        hospitalAddress: hospitalAddress.trim(),
        timezone,
        languageMode,
        rescheduleUrl: rescheduleUrl.trim(),
        entrySlug: entrySlug.trim(),
        features,
      };

      const res = await fetch(`/api/ops/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      setSuccess("Settings saved");
      setTimeout(() => setSuccess(null), 2500);
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm("Archive this team? Team data will be preserved but the team will be deactivated.")) return;

    try {
      const res = await fetch(`/api/ops/teams/${teamId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to archive");
      }
      router.push("/ops");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
    }
  };

  const handleUnassign = async (userId: string) => {
    if (!confirm("Remove this user from the team?")) return;
    try {
      const res = await fetch(
        `/api/ops/teams/${teamId}/users?userId=${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to unassign");
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unassign user");
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/ops/teams/${teamId}/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clinicRole: role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const openAssignModal = async () => {
    try {
      const res = await fetch("/api/ops/teams/users-all");
      if (res.ok) {
        setAllUsers(await res.json());
      }
    } catch {
      // ignore
    }
    setShowAssignModal(true);
  };

  const handleAssignUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/ops/teams/${teamId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clinicRole: "operator" }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      setShowAssignModal(false);
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign user");
    }
  };

  const toggleFeature = (key: string) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!team) {
    return <div className="text-gray-400">Team not found.</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/ops")}
          className="text-gray-400 hover:text-white transition-colors"
        >
          &larr; Teams
        </button>
        <h1 className="text-2xl font-bold text-white">{team.name}</h1>
        {team.isArchived && (
          <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">
            Archived
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/40 border border-green-800 text-green-300 text-sm px-4 py-3 rounded-lg mb-6">
          {success}
        </div>
      )}

      <div className="space-y-8">
        {/* General Settings */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Team Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Contact Phone</label>
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Address</label>
              <input type="text" value={hospitalAddress} onChange={(e) => setHospitalAddress(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select timezone...</option>
                {TIMEZONE_OPTIONS.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Language Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="en" checked={languageMode === "en"} onChange={() => setLanguageMode("en")} className="text-blue-500" />
                  <span className="text-sm text-gray-300">English</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="en_es" checked={languageMode === "en_es"} onChange={() => setLanguageMode("en_es")} className="text-blue-500" />
                  <span className="text-sm text-gray-300">English + Spanish</span>
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Reschedule URL</label>
              <input type="url" value={rescheduleUrl} onChange={(e) => setRescheduleUrl(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Entry Slug</label>
              <input type="text" value={entrySlug} onChange={(e) => setEntrySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        {/* Feature Flags */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Features</h2>
          <div className="space-y-3">
            {Object.entries(FEATURE_FLAGS).map(([key, flag]) => (
              <label key={key} className="flex items-center justify-between py-2 cursor-pointer">
                <span className="text-sm text-gray-300">{flag.label}</span>
                <button type="button" onClick={() => toggleFeature(key)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${features[key] ? "bg-blue-600" : "bg-gray-700"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${features[key] ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </label>
            ))}
          </div>
        </section>

        {/* Team Users */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Clinic Users</h2>
            <button type="button" onClick={openAssignModal} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 rounded-lg transition-colors">
              + Assign User
            </button>
          </div>
          {users.length === 0 ? (
            <p className="text-sm text-gray-500">No users assigned to this team.</p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user._id} className="flex items-center justify-between py-2 px-3 bg-gray-800/50 rounded-lg">
                  <div>
                    <span className="text-sm text-white">{user.name || user.email || user._id}</span>
                    {user.email && user.name && (
                      <span className="text-xs text-gray-500 ml-2">{user.email}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={user.clinicRole || "operator"}
                      onChange={(e) => handleRoleChange(user._id, e.target.value)}
                      className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300"
                    >
                      <option value="operator">Operator</option>
                      <option value="manager">Manager</option>
                    </select>
                    <button
                      onClick={() => handleUnassign(user._id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Save */}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={handleArchive}
            className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            Archive Team
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Assign User Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Assign User to Team</h3>
            {allUsers.filter((u) => u.teamId !== teamId).length === 0 ? (
              <p className="text-sm text-gray-500">No unassigned or other-team users available.</p>
            ) : (
              <div className="space-y-2">
                {allUsers
                  .filter((u) => u.teamId !== teamId)
                  .map((user) => (
                    <button
                      key={user._id}
                      onClick={() => handleAssignUser(user._id)}
                      className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <span className="text-sm text-white">{user.name || user.email || user._id}</span>
                      {user.email && user.name && (
                        <span className="text-xs text-gray-500 ml-2">{user.email}</span>
                      )}
                      {user.teamId && (
                        <span className="text-xs text-amber-500 ml-2">(currently in another team)</span>
                      )}
                    </button>
                  ))}
              </div>
            )}
            <button
              onClick={() => setShowAssignModal(false)}
              className="mt-4 w-full px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
