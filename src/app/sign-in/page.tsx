import { getLogtoContext, signIn } from '@logto/next/server-actions';
import { redirect } from 'next/navigation';
import SignIn from '../sign-in';
import { logtoConfig } from '../logto';

export default async function SignInPage() {
  const { isAuthenticated } = await getLogtoContext(logtoConfig);

  if (isAuthenticated) {
    redirect('/appointments');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Log in</h1>
            <p className="text-gray-600 dark:text-gray-400">Continue to AZ Integrated Medical.</p>
          </div>

          <div className="mt-8">
            <SignIn
              onSignIn={async () => {
                'use server';
                await signIn(logtoConfig);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


