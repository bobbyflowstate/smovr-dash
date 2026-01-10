export const Environments = {
  LOCAL: "local",
  DEV: "dev",
  PROD: "prod",
  UNKNOWN: "unknown",
} as const;

export type Environment = (typeof Environments)[keyof typeof Environments];

// Common environment allowlists
export const DEV_LOCAL_ENVS = [Environments.LOCAL, Environments.DEV] as const;

/**
 * Best-effort environment detection
 *
 * Fallback behavior:
 * - If nothing is set, we assume "local" (so local dev isn’t blocked).
 * - "production" / "prod" -> "prod"
 */
export function getCurrentEnvironment(): Environment {
  const raw =
    (process.env.CONVEX_ENV ||
      process.env.NODE_ENV ||
      process.env.VERCEL_ENV ||
      "").toLowerCase();

  if (!raw) return Environments.LOCAL;

  if (raw === "prod" || raw === "production") return Environments.PROD;
  if (raw === "dev" || raw === "development") return Environments.DEV;
  if (raw === "local") return Environments.LOCAL;

  return Environments.UNKNOWN;
}

/**
 * Throw unless current environment is one of the allowed environments.
 *
 * Example:
 *   assertEnvironment(DEV_LOCAL_ENVS, "seedRemindersTestData");
 *   assertEnvironment([Environments.STAGING], "replayStagingWebhook");
 */
export function assertEnvironment(
  allowed: readonly Environment[],
  featureName = "operation"
): void {
  const env = getCurrentEnvironment();
  if (!allowed.includes(env)) {
    throw new Error(
      `${featureName} is only allowed in environments: ${allowed.join(
        ", "
      )}. Current: "${env}"`
    );
  }
}

export function isDevEnvironment(): boolean {
  const env = getCurrentEnvironment();
  return env === Environments.DEV || env === Environments.LOCAL;
}

export function isProdEnvironment(): boolean {
  return getCurrentEnvironment() === Environments.PROD;
}

export function assertDevEnvironment(featureName = "operation"): void {
  assertEnvironment(DEV_LOCAL_ENVS, featureName);
}

export function assertProdEnvironment(featureName = "operation"): void {
  assertEnvironment([Environments.PROD], featureName);
}

/**
 * Throw if current environment is one of the disallowed environments.
 *
 * Example:
 *   assertNotEnvironment([Environments.PROD], "dangerousDevTool");
 */
export function assertNotEnvironment(
  disallowed: readonly Environment[],
  featureName = "operation"
): void {
  const env = getCurrentEnvironment();
  if (disallowed.includes(env)) {
    throw new Error(`${featureName} is not allowed in environment "${env}"`);
  }
}


