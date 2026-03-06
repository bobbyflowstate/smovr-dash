export function normalizeEmail(email?: string | null): string | null {
  if (!email) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function pickCanonicalUserId(
  users: Array<{ _id: string; _creationTime: number }>
): string | null {
  if (users.length === 0) {
    return null;
  }

  const sorted = [...users].sort((a, b) => {
    if (a._creationTime === b._creationTime) {
      return a._id.localeCompare(b._id);
    }
    return a._creationTime - b._creationTime;
  });

  return sorted[0]._id;
}
