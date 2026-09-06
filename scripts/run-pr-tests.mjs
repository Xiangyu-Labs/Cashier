#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function isDocumentationOnly(changedFiles) {
  return (
    changedFiles.length > 0 &&
    changedFiles.every(
      (file) =>
        file.startsWith("docs/") ||
        /^README[^/]*\.md$/.test(file) ||
        file === "CONTRIBUTING.md" ||
        file === "AGENTS.md"
    )
  );
}

export function main() {
  const baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/main";
  const mergeBase = git(["merge-base", "HEAD", baseRef]);
  const changedFiles = git(["diff", "--name-only", `${mergeBase}...HEAD`])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  if (isDocumentationOnly(changedFiles)) {
    console.log("PR integration tests: documentation-only changes; integration skipped.");
    return;
  }
  console.log("PR integration tests: running the full integration suite.");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-vitest.mjs",
      "run",
      "--config",
      "vitest.config.mts",
      "--project=integration-node",
      "--project=integration-dom",
      "--reporter=dot",
    ],
    { stdio: "inherit", env: process.env }
  );
  if (result.error != null) throw result.error;
  process.exitCode =
    result.signal === "SIGINT" ? 130 : result.signal === "SIGTERM" ? 143 : (result.status ?? 1);
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
