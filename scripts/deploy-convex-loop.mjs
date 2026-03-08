#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    config: ".convex-deploy-keys.json",
    dryRun: false,
    continueOnError: false,
    prod: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) {
      args.config = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--config=")) {
      args.config = arg.slice("--config=".length);
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--continue-on-error") {
      args.continueOnError = true;
      continue;
    }
    if (arg === "--prod") {
      args.prod = true;
      continue;
    }
  }

  return args;
}

function parseConfig(configPath) {
  const raw = JSON.parse(readFileSync(configPath, "utf8"));

  if (!raw || !Array.isArray(raw.deployments) || raw.deployments.length === 0) {
    throw new Error('Config must contain a non-empty "deployments" array.');
  }

  const deployments = raw.deployments.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`deployments[${index}] must be an object.`);
    }
    if (typeof item.key !== "string" || item.key.length === 0) {
      throw new Error(`deployments[${index}].key must be a non-empty string.`);
    }
    return {
      name: typeof item.name === "string" && item.name.length > 0 ? item.name : `deployment-${index + 1}`,
      key: item.key,
    };
  });

  return deployments;
}

function deployOnce({ name, key }, dryRun) {
  const label = `[${name}]`;
  const masked = `${key.slice(0, 12)}...`;

  if (dryRun) {
    console.log(`${label} dry-run: would run "npx convex deploy" with CONVEX_DEPLOY_KEY=${masked}`);
    return { ok: true };
  }

  console.log(`${label} deploying...`);

  const env = {
    ...process.env,
    CONVEX_DEPLOY_KEY: key,
  };
  delete env.CONVEX_DEPLOYMENT;
  delete env.CONVEX_URL;

  const result = spawnSync("npx", ["convex", "deploy"], {
    stdio: "inherit",
    env,
  });

  if (result.status !== 0) {
    console.error(`${label} failed (exit ${result.status ?? "unknown"})`);
    return { ok: false };
  }

  console.log(`${label} success`);
  return { ok: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = resolve(process.cwd(), args.config);

  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}. Create it from .convex-deploy-keys.example.json`
    );
  }

  const deployments = parseConfig(configPath);
  const targetPrefix = args.prod ? "prod:" : "dev:";
  const filteredDeployments = deployments.filter((item) =>
    item.key.startsWith(targetPrefix)
  );

  console.log(`Loaded ${deployments.length} deployment key(s) from ${configPath}`);
  console.log(
    `Mode: ${args.prod ? "production (--prod)" : "development (default)"}; filtering keys by prefix "${targetPrefix}"`
  );

  if (filteredDeployments.length === 0) {
    console.log("No deployment keys matched this mode. Nothing to deploy.");
    return;
  }

  let failures = 0;
  for (const deployment of filteredDeployments) {
    const { ok } = deployOnce(deployment, args.dryRun);
    if (!ok) {
      failures += 1;
      if (!args.continueOnError) {
        break;
      }
    }
  }

  if (failures > 0) {
    throw new Error(`Deployment loop finished with ${failures} failure(s).`);
  }

  console.log("All deployments completed successfully.");
}

main();
