#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TABLES = [
  "authRefreshTokens",
  "authSessions",
  "authVerificationCodes",
  "authVerifiers",
  "authAccounts",
  "messages",
  "conversations",
  "messageTemplates",
  "reminders",
  "reminderAttempts",
  "logs",
  "appointments",
  "patients",
  "teamSmsConfig",
  "users",
  "teams",
];

function loadDotEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const idx = trimmed.indexOf("=");
    if (idx <= 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/\s+#.*$/, "");

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

const deployment = process.env.CONVEX_DEPLOYMENT || "";

if (!deployment.startsWith("dev:")) {
  console.error(
    `Refusing to wipe because CONVEX_DEPLOYMENT is not a dev deployment: "${deployment}".`
  );
  process.exit(1);
}

for (const table of TABLES) {
  let totalDeleted = 0;

  while (true) {
    const payload = JSON.stringify({
      table,
      batchSize: 500,
      confirm: "WIPE_DEV_DATA",
    });
    const output = execSync(
      `npx convex run internal.devAdmin.clearTable '${payload}'`,
      { encoding: "utf8" }
    ).trim();

    const result = JSON.parse(output);
    totalDeleted += result.deleted;

    if (result.deleted === 0) {
      break;
    }
  }

  console.log(`${table}: deleted ${totalDeleted}`);
}

console.log("Done: cleared all configured dev tables.");
