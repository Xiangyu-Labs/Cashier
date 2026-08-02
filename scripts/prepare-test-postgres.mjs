import { spawnSync } from "node:child_process";
import pg from "pg";

const compose = ["compose", "-f", "docker-compose.test.yml"];
const up = spawnSync("docker", [...compose, "up", "-d", "--wait"], { stdio: "inherit" });
if (up.status !== 0) process.exit(up.status ?? 1);

const pool = new pg.Pool({
  connectionString: "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test",
  max: 1,
});
try {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public");
} finally {
  await pool.end();
}
