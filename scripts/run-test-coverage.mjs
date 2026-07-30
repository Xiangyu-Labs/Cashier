import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

mkdirSync(new URL("../coverage/.tmp", import.meta.url), { recursive: true });

const vitestCli = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const child = spawn(
  process.execPath,
  [vitestCli, "run", "--config", "vitest.config.ts", "--coverage"],
  { stdio: "inherit" }
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
