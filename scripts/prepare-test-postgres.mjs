import { spawnSync } from "node:child_process";

const compose = ["compose", "-f", "docker-compose.test.yml"];
const up = spawnSync("docker", [...compose, "up", "-d", "--wait"], { stdio: "inherit" });
if (up.status !== 0) process.exit(up.status ?? 1);
