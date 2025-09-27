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

  return (
    <ClientHeader 
      userName={extractDisplayName(claims)} 
      onSignOut={async () => {
        'use server';
        await signOut(logtoConfig);
      }}
    />
  );
}
