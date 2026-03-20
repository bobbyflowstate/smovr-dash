'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import SignOut from '../app/sign-out';
import ThemeToggle from './ThemeToggle';

interface ClientHeaderProps {
  teamId?: string | null;
  teamName?: string | null;
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function TeamLogo({ teamId, teamName }: { teamId?: string | null; teamName?: string | null }) {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!teamId) return;

    const img = new Image();
    
    const handleLoad = () => {
      console.log('Image loaded successfully');
      setImageState('loaded');
    };
    
    const handleError = () => {
      console.log('Image failed to load');
      setImageState('error');
    };

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);
    
    // Set src after event listeners are attached
    img.src = `/${teamId}.png`;
    
    // Check if image is already cached/loaded
    if (img.complete) {
      if (img.naturalHeight !== 0) {
        handleLoad();
      } else {
        handleError();
      }
    }

    return () => {
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
    };
  }, [teamId]);

  // If no teamId, show teamName immediately
  if (!teamId) {
    return (
      <span className="text-xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
        {teamName || 'Dashboard'}
      </span>
    );
  }

  return (
    <div className="flex items-center min-h-10">
      {imageState === 'loading' && (
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      )}
      
      {imageState === 'loaded' && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={imgRef}
          src={`/${teamId}.png`}
          alt={teamName || 'Team logo'}
          className="max-h-10 w-auto object-contain"
        />
      )}
      
      {imageState === 'error' && (
        <span className="text-xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          {teamName || 'Dashboard'}
        </span>
      )}
    </div>
  );
}

export default function ClientHeader({ teamId, teamName }: ClientHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/messages/unread-count');
        if (!response.ok || !isMounted) return;
        const data = await response.json();
        if (!isMounted) return;
        setUnreadCount(data.count || 0);
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching unread count:', error);
        }
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center gap-3">
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
          <TeamLogo teamId={teamId} teamName={teamName} />
        </Link>
        <nav className="hidden lg:block">
          <ul className="flex space-x-6">
            <li>
              <Link href="/appointments" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Appointments
              </Link>
            </li>
            <li>
              <Link href="/requests" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Requests
              </Link>
            </li>
            <li>
              <Link href="/patients" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Patients
              </Link>
            </li>
            <li>
              <Link href="/messages" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium inline-flex items-center">
                Messages
                <UnreadBadge count={unreadCount} />
              </Link>
            </li>
            <li>
              <Link href="/audit-logs" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Audit Logs
              </Link>
            </li>
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex items-center justify-center p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.592 1.01c1.527-.94 3.295.826 2.356 2.353a1.724 1.724 0 001.01 2.592c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.01 2.592c.94 1.527-.826 3.295-2.353 2.356a1.724 1.724 0 00-2.592 1.01c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.592-1.01c-1.527.94-3.295-.826-2.356-2.353a1.724 1.724 0 00-1.01-2.592c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.01-2.592c-.94-1.527.826-3.295 2.353-2.356.996.614 2.296.07 2.592-1.01z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          <div className="hidden md:block">
            <SignOut />
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="lg:hidden inline-flex items-center justify-center p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-2">
          <Link
            href="/appointments"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Appointments
          </Link>
          <Link
            href="/requests"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Requests
          </Link>
          <Link
            href="/patients"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Patients
          </Link>
          <Link
            href="/messages"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Messages
            <UnreadBadge count={unreadCount} />
          </Link>
          <Link
            href="/audit-logs"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Audit Logs
          </Link>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <ThemeToggle />
            <SignOut />
          </div>
        </div>
      )}
    </header>
  );
}
