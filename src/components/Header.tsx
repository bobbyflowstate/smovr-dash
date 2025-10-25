import Link from 'next/link';
import { getLogtoContext, signOut } from '@logto/next/server-actions';
import { logtoConfig } from '../app/logto';
import SignOut from '../app/sign-out';
import ClientHeader from '@/components/ClientHeader';
import { extractDisplayName } from '@/lib/auth-utils';

export default async function Header() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  if (!isAuthenticated) {
    return null; // Don't show header if not authenticated
  }

  // Fetch user name from Convex database
  let userName = extractDisplayName(claims); // Fallback to Logto claims
  
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = cookies();
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/users`, {
      headers: {
        'Cookie': cookieStore.toString()
      }
    });
    
    if (response.ok) {
      const userInfo = await response.json();
      userName = userInfo.userName; // Use name from Convex database
    }
  } catch (error) {
    console.error('Header: Error fetching user info:', error);
    // userName remains as fallback value
  }

  return (
    <ClientHeader 
      userName={userName} 
      onSignOut={async () => {
        'use server';
        await signOut(logtoConfig);
      }}
    />
  );
}
