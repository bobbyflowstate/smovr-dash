"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface TeamSummary {
  _id: string;
  name: string;
  entrySlug?: string;
  timezone?: string;
  contactPhone?: string;
  languageMode?: string;
  features?: Record<string, boolean>;
  isArchived?: boolean;
  smsProvider: string | null;
  smsEnabled: boolean;
  userCount: number;
}

export default function OpsDashboardPage() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/ops/teams?includeArchived=${showArchived}`
      );
      if (res.ok) {
        setTeams(await res.json());
      }
    } catch {
      console.error("Failed to fetch teams");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  const enabledFeatureCount = (features?: Record<string, boolean>) =>
    features ? Object.values(features).filter(Boolean).length : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage all clinic teams in this deployment.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            Show archived
          </label>
          <Link
            href="/ops/teams/new"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Team
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No teams found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {teams.map((team) => (
            <Link
              key={team._id}
              href={`/ops/teams/${team._id}`}
              className={`block bg-gray-900 border rounded-xl p-5 hover:border-gray-600 transition-colors ${
                team.isArchived
                  ? "border-gray-800 opacity-60"
                  : "border-gray-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">
                      {team.name}
                    </h2>
                    {team.isArchived && (
                      <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-400">
                    {team.entrySlug && (
                      <span>
                        Slug: <span className="text-gray-300">{team.entrySlug}</span>
                      </span>
                    )}
                    {team.timezone && (
                      <span>
                        TZ: <span className="text-gray-300">{team.timezone}</span>
                      </span>
                    )}
                    {team.contactPhone && (
                      <span>
                        Phone: <span className="text-gray-300">{team.contactPhone}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400">
                    {team.userCount} user{team.userCount !== 1 ? "s" : ""}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      team.smsEnabled
                        ? "bg-green-900/50 text-green-300"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    SMS {team.smsEnabled ? `(${team.smsProvider})` : "off"}
                  </span>
                  {team.features && (
                    <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full text-xs font-medium">
                      {enabledFeatureCount(team.features)} features
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
