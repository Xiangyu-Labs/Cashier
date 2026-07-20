import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, script), ...args], { cwd: projectRoot, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

function runVitest(project) {
  return run("node_modules/vitest/vitest.mjs", ["run", "--config", "vitest.config.ts", "--project", project]);
}

const structuralPath = ".tmp/performance/structural-analysis.json";

try {
  await run("scripts/performance/analyze-client-bundle.mjs", ["--build"]);
  await rm(path.join(projectRoot, structuralPath), { force: true });
  await runVitest("performance-node");
  await runVitest("performance-dom");
  await run("scripts/performance/write-performance-report.mjs", ["--structural", structuralPath]);
} catch (error) {
  console.error(`Performance baseline failed: ${error.message}`);
  process.exitCode = 1;
}
