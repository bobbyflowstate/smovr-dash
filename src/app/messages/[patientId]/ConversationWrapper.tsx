import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '../../logto';
import ConversationClient from './ConversationClient';
import { extractDisplayName, getUserIdentifier } from '@/lib/auth-utils';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import Link from 'next/link';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

interface ConversationWrapperProps {
  patientId: string;
}

export default async function ConversationWrapper({ patientId }: ConversationWrapperProps) {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  if (!isAuthenticated || !claims) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Authentication Required</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            You must be logged in to view this conversation.
          </p>
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Log in
          </Link>
        </div>
      </div>
    );
  }

  const userIdentifier = getUserIdentifier(claims);
  const name = extractDisplayName(claims);
  const logtoUserId = claims.sub;

  if (!userIdentifier) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">User Identifier Required</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Unable to get a user identifier from your account.
          </p>
        </div>
      </div>
    );
  }

  // Ensure user exists and get patient info
  let patientName: string | null = null;
  let patientPhone: string | null = null;
  let teamName = "Unknown Team";
  
  try {
    await convex.mutation(api.users.getOrCreateUserByEmail, {
      email: userIdentifier,
      name,
      logtoUserId,
    });

    const userInfo = await convex.query(api.users.getUserWithTeam, { 
      userEmail: userIdentifier 
    });

    if (userInfo) {
      teamName = userInfo.teamName || "Unknown Team";
    }

    // Get patient info
    const patient = await convex.query(api.patients.getById, {
      patientId: patientId as Id<"patients">,
    });

    if (patient) {
      patientName = patient.name || null;
      patientPhone = patient.phone;
    }
  } catch (error) {
    console.error('ConversationWrapper: Error fetching info:', error);
  }

  if (!patientPhone) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Patient Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This patient does not exist or you don&apos;t have access.
          </p>
          <Link
            href="/messages"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Back to Messages
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ConversationClient 
      patientId={patientId}
      patientName={patientName}
      patientPhone={patientPhone}
      teamName={teamName}
      userName={name}
    />
  );
}

