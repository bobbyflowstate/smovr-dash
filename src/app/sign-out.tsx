'use client';

import { useAuthActions } from "@convex-dev/auth/react";

const SignOut = () => {
  const { signOut } = useAuthActions();

  return (
    <button
      onClick={() => void signOut()}
      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
    >
      Sign Out
    </button>
  );
};

export default SignOut;
