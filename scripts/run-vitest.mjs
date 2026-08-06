import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test";
const runId = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const sanitizedRunId = sanitizeIdentifierPart(runId);
const schemaPrefix = `test_${sanitizedRunId}_`;
const childEnvironment = { ...process.env, CASHIER_TEST_RUN_ID: runId };
const prepareScript = fileURLToPath(new URL("./prepare-test-postgres.mjs", import.meta.url));
const vitestCli = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));

let activeChild;
let requestedSignal;

function sanitizeIdentifierPart(value) {
  const sanitized = value.replace(/[^a-zA-Z0-9_]/g, "_");
  if (sanitized.length === 0) throw new Error("Cannot derive a PostgreSQL identifier component");
  if (sanitized.length > 40) {
    throw new Error("CASHIER_TEST_RUN_ID is too long for a PostgreSQL test schema name");
  }
  return sanitized;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function signalExitCode(signal) {
  return signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
}

function runChild(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: childEnvironment,
      stdio: "inherit",
    });
    activeChild = child;

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      resolve({ code, signal });
    });
  });
}

function forwardSignal(signal) {
  requestedSignal = signal;
  if (activeChild != null && !activeChild.killed) {
    activeChild.kill(signal);
  }
}

async function cleanupRunSchemas() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query(
      `SELECT nspname
       FROM pg_namespace
       WHERE left(nspname, char_length($1)) = $1
       ORDER BY nspname`,
      [schemaPrefix]
    );

    for (const row of result.rows) {
      await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(row.nspname)} CASCADE`);
    }
  } finally {
    await pool.end();
  }
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

let exitCode = 0;
try {
  const prepareResult = await runChild(process.execPath, [prepareScript]);
  if (prepareResult.signal != null || prepareResult.code !== 0) {
    exitCode =
      prepareResult.signal != null
        ? signalExitCode(prepareResult.signal)
        : (prepareResult.code ?? 1);
  } else if (requestedSignal == null) {
    if (process.argv.includes("--coverage")) {
      mkdirSync(new URL("../coverage/.tmp", import.meta.url), { recursive: true });
    }

    const vitestResult = await runChild(process.execPath, [vitestCli, ...process.argv.slice(2)]);
    exitCode =
      vitestResult.signal != null ? signalExitCode(vitestResult.signal) : (vitestResult.code ?? 1);
  } else {
    exitCode = signalExitCode(requestedSignal);
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  try {
    await cleanupRunSchemas();
  } catch (error) {
    console.error("Failed to clean up test schemas:", error);
    exitCode = 1;
  }
}

process.removeAllListeners("SIGINT");
process.removeAllListeners("SIGTERM");
process.exitCode = exitCode;
