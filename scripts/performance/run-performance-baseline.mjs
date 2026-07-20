import { spawn } from "node:child_process";
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

try {
  await run("scripts/performance/analyze-client-bundle.mjs", ["--build"]);
  await run("scripts/performance/write-performance-report.mjs");
} catch (error) {
  console.error(`Performance baseline failed: ${error.message}`);
  process.exitCode = 1;
}
