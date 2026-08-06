#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const baseRef = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : "origin/main";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function isFullIntegrationChange(file) {
  if (
    file.startsWith("src/persistence/") ||
    file === "src/application/server-composition-root.ts" ||
    file.startsWith("tests/setup") ||
    file.startsWith("tests/helpers/") ||
    /^vitest[^/]*\.mts$/.test(file) ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "docker-compose.test.yml"
  ) {
    return true;
  }

  const basename = path.basename(file);
  return (
    file === "scripts/run-vitest.mjs" ||
    file === "scripts/prepare-test-postgres.mjs" ||
    file === "scripts/run-pr-tests.mjs" ||
    file === "scripts/check-test-architecture.mjs" ||
    (file.startsWith("scripts/") && /(?:test|vitest)/i.test(basename))
  );
}

let mergeBase;
try {
  mergeBase = git(["merge-base", "HEAD", baseRef]);
} catch (error) {
  console.error(`Unable to resolve merge-base against ${baseRef}. Fetch the base branch first.`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const changedFiles = git(["diff", "--name-only", `${mergeBase}...HEAD`])
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);
const fullIntegration = changedFiles.some(isFullIntegrationChange);
const vitestArgs = [
  "scripts/run-vitest.mjs",
  "run",
  "--config",
  "vitest.integration.config.mts",
  "--reporter=dot",
];

if (fullIntegration) {
  console.log("PR integration tests: infrastructure changes detected; running the full suite.");
} else {
  vitestArgs.push(`--changed=${mergeBase}`);
  console.log(`PR integration tests: running Vitest tests changed since ${mergeBase}.`);
}

const result = spawnSync(process.execPath, vitestArgs, {
  stdio: "inherit",
  env: process.env,
});
if (result.error != null) {
  console.error(result.error);
  process.exitCode = 1;
} else if (result.signal != null) {
  process.exitCode = result.signal === "SIGINT" ? 130 : result.signal === "SIGTERM" ? 143 : 1;
} else {
  process.exitCode = result.status ?? 1;
}
