import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from '../../../convex/_generated/api';
import AppointmentsClient from './AppointmentsClient';
import Link from 'next/link';

export default async function AppointmentsWrapper() {
  const token = await convexAuthNextjsToken();

  if (!token) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Authentication Required</h1>
          <p className="text-gray-600 dark:text-gray-400">
            You must be logged in to view appointments. Please log in and try again.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 rounded-lg transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  await fetchMutation(api.users.ensureTeam, {}, { token });

  const userInfo = await fetchQuery(api.users.currentUser, {}, { token });
  const userName = userInfo?.userName || "User";
  const teamName = userInfo?.teamName || "Unknown Team";
  const team = userInfo?.teamId
    ? await fetchQuery(api.teams.getById, { teamId: userInfo.teamId }, { token })
    : null;
  const teamTimezone = team?.timezone || null;
  const teamHospitalAddress = team?.hospitalAddress || null;

  return (
    <AppointmentsClient 
      userName={userName}
      teamName={teamName}
      initialTeamTimezone={teamTimezone}
      initialTeamHospitalAddress={teamHospitalAddress}
    />
  );
}
