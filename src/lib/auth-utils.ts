/**
 * Extract a display name from Logto claims
 * Priority: name -> username -> email (part before @) -> fallback
 */
export function extractDisplayName(claims: any, fallback: string = 'Unknown User'): string {
  // Use name if available
  if (claims.name) {
    return claims.name;
  }
  
  // Use username if available
  if (claims.username) {
    return claims.username;
  }
  
  // Extract from email if available
  if (claims.email) {
    // Extract the part before @ from email
    let name = claims.email.split('@')[0];
    // Clean up common email patterns (remove + suffixes)
    name = name.split('+')[0];
    // Capitalize first letter and return
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  return fallback;
}

/**
 * Get user identifier for database lookups
 * Priority: email -> username -> sub (user ID)
 */
export function getUserIdentifier(claims: any): string | null {
  return claims.email || claims.username || claims.sub || null;
}
