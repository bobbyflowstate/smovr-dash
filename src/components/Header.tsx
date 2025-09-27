import Link from 'next/link';
import { getLogtoContext, signOut } from '@logto/next/server-actions';
import { logtoConfig } from '../app/logto';
import SignOut from '../app/sign-out';

export default async function Header() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  if (!isAuthenticated) {
    return null; // Don't show header if not authenticated
  }

  return (
    <header className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold hover:text-gray-300">
          Smovr Dash
        </Link>
        <nav>
          <ul className="flex space-x-4">
            <li>
              <Link href="/appointments" className="hover:text-gray-300">
                Appointments
              </Link>
            </li>
            <li>
              <Link href="/submit" className="hover:text-gray-300">
                Submit
              </Link>
            </li>
            <li>
              <Link href="/logs" className="hover:text-gray-300">
                Logs
              </Link>
            </li>
          </ul>
        </nav>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-300">
            {claims?.name || claims?.sub}
          </span>
          <SignOut
            onSignOut={async () => {
              'use server';
              await signOut(logtoConfig);
            }}
          />
        </div>
      </div>
    </header>
  );
}
