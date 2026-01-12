import { parsePhoneNumberFromString } from "libphonenumber-js";

const DEFAULT_COUNTRY = "US" as const;

export function formatPhoneForDisplay(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const phone = tryParse(trimmed);
  if (phone) return phone.formatNational();

  // Fallback: show input as-is (but avoid rendering empty strings)
  return trimmed ? trimmed : null;
}

/**
 * Normalize a phone string into something safe for a `tel:` link.
 *
 * - Prefers E.164 when possible.
 * - Returns null if it can't produce something plausibly callable.
 */
export function normalizePhoneForTel(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const phone = tryParse(trimmed);
  if (phone) return phone.number; // E.164

  // Fallback: accept +<digits> if it looks plausible
  const withoutTel = trimmed.toLowerCase().startsWith("tel:") ? trimmed.slice(4) : trimmed;
  const maybe = withoutTel.trim();
  if (maybe.startsWith("+")) {
    const digits = maybe.replace(/[^\d]/g, "");
    if (digits.length >= 7) return `+${digits}`;
  }

  // Last resort: if there are enough digits, return digits only
  const digitsOnly = withoutTel.replace(/[^\d]/g, "");
  if (digitsOnly.length >= 7) return digitsOnly;
  return null;
}

function tryParse(input: string) {
  try {
    // If it's already +E.164-ish, parsing doesn't need a default country.
    if (input.trim().startsWith("+")) return parsePhoneNumberFromString(input);
    // Otherwise interpret as a local number in our default country.
    return parsePhoneNumberFromString(input, DEFAULT_COUNTRY);
  } catch {
    return undefined;
  }
}


