import { spawnSync } from "node:child_process";
import pg from "pg";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test";
const compose = ["compose", "-p", "cashier-test", "-f", "docker-compose.test.yml"];

async function isDatabaseHealthy() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 1_000,
  });

  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

if (!(await isDatabaseHealthy())) {
  const up = spawnSync("docker", [...compose, "up", "-d", "--wait"], { stdio: "inherit" });
  if (up.status !== 0) process.exit(up.status ?? 1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query("SELECT 1");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public");
} finally {
  await pool.end();
}
