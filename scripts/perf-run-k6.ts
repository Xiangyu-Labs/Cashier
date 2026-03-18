import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const preset = process.argv[2];

if (preset !== "smoke" && preset !== "baseline") {
  console.error("Usage: tsx scripts/perf-run-k6.ts <smoke|baseline>");
  process.exit(1);
}

const cwd = process.cwd();
const seedPath = path.join(cwd, "perf/.seed.json");
const scriptPath = path.join(cwd, "perf/k6/api-load.js");
const summaryPath = path.join(cwd, `data/perf-${preset}-summary.json`);

async function ensureReadable(filePath: string, hint: string) {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(hint);
  }
}

async function run() {
  await ensureReadable(seedPath, "Missing perf/.seed.json. Run `npm run perf:seed` first.");
  await ensureReadable(
    scriptPath,
    "Missing perf/k6/api-load.js. The perf k6 script was not found."
  );
  await mkdir(path.dirname(summaryPath), { recursive: true });

  const k6Bin = process.env.K6_BIN ?? "k6";
  const perfBaseUrl = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000";
  const perfScenario = process.env.PERF_SCENARIO ?? "read_mix";

  const child = spawn(k6Bin, ["run", `--summary-export=${summaryPath}`, scriptPath], {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      PERF_PRESET: preset,
      PERF_BASE_URL: perfBaseUrl,
      PERF_SCENARIO: perfScenario,
    },
  });

  child.on("error", (error) => {
    if ("code" in error && error.code === "ENOENT") {
      console.error(
        [
          `Could not find \`${k6Bin}\` in PATH.`,
          "Install k6 locally or set K6_BIN to the full executable path.",
          "Example: `K6_BIN=/usr/local/bin/k6 npm run perf:smoke`",
        ].join("\n")
      );
      process.exit(1);
    }

    console.error(error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal != null) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
