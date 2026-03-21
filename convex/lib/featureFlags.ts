export const FEATURE_FLAGS = {
  referrals_enabled: { label: "Referrals", default: true },
  two_way_sms_enabled: { label: "Two-Way SMS", default: true },
  reactivation_enabled: { label: "Reactivation", default: true },
  booking_page_enabled: { label: "Booking Page", default: true },
  website_entry_enabled: { label: "Website Entry", default: true },
  birthday_reminders_enabled: { label: "Birthday Reminders", default: true },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(
  features: Record<string, boolean> | undefined,
  key: FeatureFlagKey
): boolean {
  if (features && key in features) {
    return features[key];
  }
  return FEATURE_FLAGS[key].default;
}
