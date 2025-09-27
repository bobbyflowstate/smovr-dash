export default function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  // Authentication is now handled purely server-side with Logto
  // No client-side auth state management needed
  return <>{children}</>;
}
