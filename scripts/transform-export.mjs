#!/usr/bin/env node

/**
 * Transform exported Convex data for import into the new deployment.
 *
 * Usage:
 *   1. Export from old deployment:
 *      npx convex export --path ./export
 *
 *   2. Run this script:
 *      node scripts/transform-export.mjs ./export ./export-transformed
 *
 *   3. Import into new deployment:
 *      npx convex import --path ./export-transformed
 *
 * What this does:
 *   - Copies all table JSONL files from source to destination
 *   - Transforms the `users` table to make fields optional as required
 *     by the new schema (teamId, tokenIdentifier become optional)
 *   - Skips auth-related tables that will be managed by Convex Auth
 *     (authAccounts, authSessions, authRefreshTokens, authVerificationCodes, authVerifiers)
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "fs";
import { join, basename } from "path";

const AUTH_TABLES_TO_SKIP = new Set([
  "authAccounts",
  "authSessions",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
]);

function main() {
  const [srcDir, destDir] = process.argv.slice(2);

  if (!srcDir || !destDir) {
    console.error("Usage: node scripts/transform-export.mjs <source-dir> <dest-dir>");
    process.exit(1);
  }

  if (!existsSync(srcDir)) {
    console.error(`Source directory not found: ${srcDir}`);
    process.exit(1);
  }

  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(srcDir);

  for (const file of files) {
    const srcPath = join(srcDir, file);
    const destPath = join(destDir, file);
    const tableName = basename(file, ".jsonl");

    if (AUTH_TABLES_TO_SKIP.has(tableName)) {
      console.log(`  Skipping ${file} (Convex Auth managed table)`);
      continue;
    }

    if (tableName === "users" && file.endsWith(".jsonl")) {
      console.log(`  Transforming ${file}...`);
      const lines = readFileSync(srcPath, "utf-8").split("\n").filter(Boolean);
      const transformed = lines.map((line) => {
        const doc = JSON.parse(line);
        // All fields are now optional in the new schema, so just pass through.
        // The existing data already has these fields populated.
        return JSON.stringify(doc);
      });
      writeFileSync(destPath, transformed.join("\n") + "\n");
      console.log(`    -> ${transformed.length} user records written`);
    } else {
      console.log(`  Copying ${file}`);
      copyFileSync(srcPath, destPath);
    }
  }

  console.log(`\nDone! Transformed export in: ${destDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Set CONVEX_DEPLOYMENT to the new deployment`);
  console.log(`  2. Run: npx convex import --path ${destDir}`);
  console.log(`  3. Set environment variables on the new deployment:`);
  console.log(`     - JWT_PRIVATE_KEY (from generateKeys.mjs)`);
  console.log(`     - JWKS (from generateKeys.mjs)`);
  console.log(`     - SITE_URL (your production URL)`);
  console.log(`     - AUTH_RESEND_KEY (your Resend API key)`);
}

main();
