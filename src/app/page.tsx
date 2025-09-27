import { getLogtoContext, signIn, signOut } from '@logto/next/server-actions';
import SignIn from './sign-in';
import SignOut from './sign-out';
import { logtoConfig } from './logto';
import Link from 'next/link';

export default async function Home() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated ? (
        // Authenticated user sees the dashboard
        <div className="container mx-auto p-8">
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Welcome to Smovr Dashboard
            </h1>
            <p className="text-gray-600 mb-6">
              Hello, {claims?.name || claims?.sub}! You're successfully authenticated.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Link 
                href="/appointments" 
                className="bg-blue-500 hover:bg-blue-600 text-white p-6 rounded-lg text-center transition-colors"
              >
                <h2 className="text-xl font-semibold mb-2">Appointments</h2>
                <p>Manage patient appointments</p>
              </Link>
              
              <Link 
                href="/submit" 
                className="bg-green-500 hover:bg-green-600 text-white p-6 rounded-lg text-center transition-colors"
              >
                <h2 className="text-xl font-semibold mb-2">Submit</h2>
                <p>Submit patient information</p>
              </Link>
              
              <Link 
                href="/logs" 
                className="bg-purple-500 hover:bg-purple-600 text-white p-6 rounded-lg text-center transition-colors"
              >
                <h2 className="text-xl font-semibold mb-2">Logs</h2>
                <p>View system logs</p>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        // Unauthenticated user sees the login page
        <div className="flex items-center justify-center min-h-screen">
          <div className="max-w-md w-full space-y-8 p-8">
            <div className="text-center">
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Welcome to Smovr Dash
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Please sign in to access your dashboard
              </p>
            </div>
            <div className="mt-8 space-y-6">
              <SignIn
                onSignIn={async () => {
                  'use server';
                  await signIn(logtoConfig);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
