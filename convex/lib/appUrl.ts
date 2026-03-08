export function getCanonicalAppUrl(): string | null {
  return (
    process.env.SITE_URL ||
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    null
  );
}
