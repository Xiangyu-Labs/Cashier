import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { chromium } from "@playwright/test";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARTIFACT_PATH = path.join(PROJECT_ROOT, ".tmp/performance/browser-workflows.json");
const TSCONFIG_PATH = path.join(PROJECT_ROOT, "tsconfig.json");
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test";

function safeTestDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  const hostIsLocal = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  const databaseIsTestOnly = url.pathname.toLowerCase().includes("test");
  if (!hostIsLocal || !databaseIsTestOnly) {
    throw new Error("Browser workflows require a local test database URL whose database name contains 'test'.");
  }
  return url;
}

async function allocatePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("Could not allocate a local browser server port.");
  await new Promise((resolve, reject) => server.close((error) => (error == null ? resolve() : reject(error))));
  return address.port;
}

async function writeUnavailable(status, reason, remediation) {
  await mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
  await writeFile(
    ARTIFACT_PATH,
    `${JSON.stringify({ schemaVersion: 1, status, environment: "local-dev-test-only", reason, remediation }, null, 2)}\n`
  );
}

function run(command, args, env = process.env) {
  return spawnSync(command, args, { cwd: PROJECT_ROOT, env, stdio: "inherit" });
}

async function createBrowserSchema(databaseUrl) {
  const schemaName = `browser_performance_${process.pid}_${Date.now().toString(36)}`;
  const migrationsSchema = `${schemaName}_migrations`;
  const { Pool } = pg;
  const admin = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
  await admin.query(`CREATE SCHEMA "${schemaName}"`);

  const scopedUrl = new URL(databaseUrl);
  scopedUrl.searchParams.set("options", `-c search_path=${schemaName}`);
  const pool = new Pool({ connectionString: scopedUrl.toString(), max: 2 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(PROJECT_ROOT, "src/persistence/postgres-migrations"),
      migrationsSchema,
    });
  } catch (error) {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.query(`DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`);
    await admin.end();
    throw error;
  }
  await pool.end();
  return {
    scopedUrl: scopedUrl.toString(),
    async dispose() {
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`);
      await admin.end();
    },
  };
}

async function main() {
  if (!existsSync(chromium.executablePath())) {
    await writeUnavailable("skipped", "Playwright Chromium is not installed.", "npx playwright install chromium");
    return;
  }

  let databaseUrl;
  try {
    databaseUrl = safeTestDatabaseUrl(TEST_DATABASE_URL);
  } catch (error) {
    await writeUnavailable("blocked", error.message, "Set TEST_DATABASE_URL to the local cashier_test database, then run npm run test:performance:browser");
    return;
  }

  if (run(process.execPath, ["scripts/prepare-test-postgres.mjs"]).status !== 0) {
    await writeUnavailable("blocked", "The local test PostgreSQL service is unavailable.", "npm run test:prepare && npm run test:performance:browser");
    return;
  }

  let database;
  try {
    database = await createBrowserSchema(databaseUrl);
  } catch {
    await writeUnavailable("blocked", "The isolated browser test schema could not be migrated.", "npm run test:prepare && npm run test:performance:browser");
    return;
  }

  try {
    await rm(ARTIFACT_PATH, { force: true });
    const originalTsconfig = await readFile(TSCONFIG_PATH, "utf8");
    const port = await allocatePort();
    let result;
    try {
      result = run(
        process.execPath,
        ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.config.ts"],
        {
          ...process.env,
          PLAYWRIGHT_PORT: String(port),
          BROWSER_TEST_DATABASE_URL: database.scopedUrl,
          BROWSER_WORKFLOW_DIST_DIR: `.tmp/performance/next-dev-${port}`,
        }
      );
    } finally {
      await writeFile(TSCONFIG_PATH, originalTsconfig);
    }
    if (result.status !== 0) {
      await writeUnavailable(
        "blocked",
        "The visible dev-auth browser workflow did not complete; failure screenshots and traces are in ignored .tmp/performance/playwright output.",
        "npm run test:performance:browser"
      );
    }
  } finally {
    await database.dispose();
  }
}

main().catch(async () => {
  await writeUnavailable("blocked", "The local browser workflow runner could not start.", "npm run test:performance:browser");
  process.exitCode = 1;
});
