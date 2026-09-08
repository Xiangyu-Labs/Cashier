#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createTestEnvironment } from "./test-environment.mjs";

export function signalExitCode(signal) {
  return signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
}

export async function runVitest({
  args = process.argv.slice(2),
  environment = process.env,
  spawnProcess = spawn,
} = {}) {
  if (args.includes("--coverage")) {
    mkdirSync(path.resolve("coverage/.tmp"), { recursive: true });
  }

  const vitestCli = path.resolve("node_modules/vitest/vitest.mjs");
  const child = spawnProcess(process.execPath, [vitestCli, ...args], {
    env: createTestEnvironment(environment),
    stdio: "inherit",
  });
  let requestedSignal;

  const forwardSignal = (signal) => {
    requestedSignal = signal;
    if (!child.killed) child.kill(signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (requestedSignal) return signalExitCode(requestedSignal);
    return result.signal ? signalExitCode(result.signal) : (result.code ?? 1);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runVitest()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
