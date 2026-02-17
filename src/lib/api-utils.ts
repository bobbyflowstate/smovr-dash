/**
 * Sanitise error messages before returning them to API clients.
 *
 * Short, single-line messages are assumed to be intentional user-facing
 * strings (e.g. "Patient not found"). Multi-line or stack-trace-like
 * messages are replaced with a generic fallback to avoid leaking
 * database errors, internal URLs, or stack traces.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof Error &&
    error.message &&
    !error.message.includes('\n') &&
    error.message.length < 200
  ) {
    return error.message;
  }
  return fallback;
}
