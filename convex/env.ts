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
 *
 * Notes on Convex:
 * - Convex Cloud "Development" deployments may still run with NODE_ENV="production".
 *   So NODE_ENV is *not* a reliable signal for prod vs dev inside Convex functions.
 * - Prefer either:
 *   - Convex's deployment identifier (if present in runtime env), e.g. "dev:xyz" / "prod:xyz"
 *   - An explicit CONVEX_ENV env var you set per deployment.
 */
export function getCurrentEnvironment(): Environment {
  const parse = (raw: string): Environment => {
    const v = raw.toLowerCase();
    if (v === "prod" || v === "production") return Environments.PROD;
    if (v === "dev" || v === "development") return Environments.DEV;
    if (v === "local") return Environments.LOCAL;
    return Environments.UNKNOWN;
  };

  // 1) Explicit override we control (recommended)
  if (process.env.CONVEX_ENV) return parse(process.env.CONVEX_ENV);

  // 2) Convex deployment identifier (preferred if available at runtime)
  // Common format: "dev:xyz", "prod:xyz", "local:xyz"
  const deployment = process.env.CONVEX_DEPLOYMENT;
  if (deployment) {
    const prefix = deployment.split(":")[0] ?? "";
    const mapped = parse(prefix);
    if (mapped !== Environments.UNKNOWN) return mapped;
  }

  // 3) Vercel (if code ever runs there)
  if (process.env.VERCEL_ENV) return parse(process.env.VERCEL_ENV);

  // 4) NODE_ENV is ambiguous in Convex; only treat "development" as dev.
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  if (nodeEnv === "development") return Environments.DEV;
  if (!nodeEnv) return Environments.LOCAL;

  // Anything else (including "production") is unknown unless explicitly overridden above.
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


