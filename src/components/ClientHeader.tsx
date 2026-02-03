'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import SignOut from '../app/sign-out';
import ThemeToggle from './ThemeToggle';

interface ClientHeaderProps {
  userName?: string;
  teamId?: string | null;
  teamName?: string | null;
  onSignOut: () => Promise<void>;
}

function UnreadBadge() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/messages/unread-count');
        if (response.ok) {
          const data = await response.json();
          setUnreadCount(data.count || 0);
        }
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };

    fetchUnreadCount();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  if (unreadCount === 0) return null;

  return (
    <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
      {unreadCount > 99 ? '99+' : unreadCount}
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

export default function ClientHeader({ userName, teamId, teamName, onSignOut }: ClientHeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
          <TeamLogo teamId={teamId} teamName={teamName} />
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
              <Link href="/patients" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Patients
              </Link>
            </li>
            <li>
              <Link href="/messages" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium inline-flex items-center">
                Messages
                <UnreadBadge />
              </Link>
            </li>
            <li>
              <Link href="/audit-logs" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                Audit Logs
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
