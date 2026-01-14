import { describe, expect, it, afterEach } from "vitest";
import {
  Environments,
  getCurrentEnvironment,
  assertEnvironment,
  assertDevEnvironment,
  assertProdEnvironment,
  isDevEnvironment,
  isProdEnvironment,
} from "../convex/env";

const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => resetEnv());

describe("convex/env", () => {
  it("defaults to local when no env vars are set", () => {
    setEnv({ CONVEX_ENV: undefined, NODE_ENV: undefined, VERCEL_ENV: undefined });
    expect(getCurrentEnvironment()).toBe(Environments.LOCAL);
  });

  it("prefers CONVEX_ENV over NODE_ENV/VERCEL_ENV", () => {
    setEnv({ CONVEX_ENV: "prod", NODE_ENV: "development", VERCEL_ENV: "development" });
    expect(getCurrentEnvironment()).toBe(Environments.PROD);
  });

  it("infers from CONVEX_DEPLOYMENT prefix when CONVEX_ENV is unset", () => {
    setEnv({ CONVEX_ENV: undefined, CONVEX_DEPLOYMENT: "dev:amiable-crocodile-286" });
    expect(getCurrentEnvironment()).toBe(Environments.DEV);

    setEnv({ CONVEX_ENV: undefined, CONVEX_DEPLOYMENT: "prod:smovr-dash" });
    expect(getCurrentEnvironment()).toBe(Environments.PROD);

    setEnv({ CONVEX_ENV: undefined, CONVEX_DEPLOYMENT: "local:whatever" });
    expect(getCurrentEnvironment()).toBe(Environments.LOCAL);
  });

  it("maps common values to known environments", () => {
    setEnv({ CONVEX_ENV: "production" });
    expect(getCurrentEnvironment()).toBe(Environments.PROD);

    setEnv({ CONVEX_ENV: "prod" });
    expect(getCurrentEnvironment()).toBe(Environments.PROD);

    setEnv({ CONVEX_ENV: "development" });
    expect(getCurrentEnvironment()).toBe(Environments.DEV);

    setEnv({ CONVEX_ENV: "dev" });
    expect(getCurrentEnvironment()).toBe(Environments.DEV);

    setEnv({ CONVEX_ENV: "local" });
    expect(getCurrentEnvironment()).toBe(Environments.LOCAL);
  });

  it("treats NODE_ENV=production as unknown in Convex contexts", () => {
    setEnv({ CONVEX_ENV: undefined, CONVEX_DEPLOYMENT: undefined, VERCEL_ENV: undefined, NODE_ENV: "production" });
    expect(getCurrentEnvironment()).toBe(Environments.UNKNOWN);
  });

  it("returns unknown for unrecognized env values", () => {
    setEnv({ CONVEX_ENV: "weird" });
    expect(getCurrentEnvironment()).toBe(Environments.UNKNOWN);
  });

  it("assertEnvironment allows only listed envs", () => {
    setEnv({ CONVEX_ENV: "dev" });
    expect(() =>
      assertEnvironment([Environments.DEV, Environments.LOCAL], "feature")
    ).not.toThrow();

    setEnv({ CONVEX_ENV: "prod" });
    expect(() =>
      assertEnvironment([Environments.DEV, Environments.LOCAL], "feature")
    ).toThrow(/feature is only allowed/i);
  });

  it("assertDevEnvironment allows local/dev and rejects prod", () => {
    setEnv({ CONVEX_ENV: "local" });
    expect(() => assertDevEnvironment("seed")).not.toThrow();
    expect(isDevEnvironment()).toBe(true);
    expect(isProdEnvironment()).toBe(false);

    setEnv({ CONVEX_ENV: "dev" });
    expect(() => assertDevEnvironment("seed")).not.toThrow();
    expect(isDevEnvironment()).toBe(true);

    setEnv({ CONVEX_ENV: "prod" });
    expect(() => assertDevEnvironment("seed")).toThrow();
    expect(isDevEnvironment()).toBe(false);
    expect(isProdEnvironment()).toBe(true);
  });

  it("assertProdEnvironment allows prod and rejects local/dev", () => {
    setEnv({ CONVEX_ENV: "prod" });
    expect(() => assertProdEnvironment("prodOnly")).not.toThrow();
    expect(isProdEnvironment()).toBe(true);

    setEnv({ CONVEX_ENV: "dev" });
    expect(() => assertProdEnvironment("prodOnly")).toThrow();

    setEnv({ CONVEX_ENV: "local" });
    expect(() => assertProdEnvironment("prodOnly")).toThrow();
  });
});


