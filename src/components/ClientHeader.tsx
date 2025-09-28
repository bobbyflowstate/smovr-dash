'use client';

import Link from 'next/link';
import SignOut from '../app/sign-out';
import ThemeToggle from './ThemeToggle';

interface ClientHeaderProps {
  userName?: string;
  onSignOut: () => Promise<void>;
}

export default function ClientHeader({ userName, onSignOut }: ClientHeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          SMOVR
        </Link>
        <nav>
          <ul className="flex space-x-6">
            <li>
              <Link href="/appointments" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Appointments
              </Link>
            </li>
            <li>
              <Link href="/submit" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Submit
              </Link>
            </li>
            <li>
              <Link href="/logs" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Logs
              </Link>
            </li>
          </ul>
        </nav>
        <div className="flex items-center space-x-4">
          <ThemeToggle />
          <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
            {userName}
          </span>
          <SignOut onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
