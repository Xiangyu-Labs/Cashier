import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../coverage/.tmp", import.meta.url), { recursive: true });

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["vitest", "run", "--config", "vitest.config.ts", "--coverage"], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
