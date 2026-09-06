import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/** @param {string} directory @param {Record<string, string | undefined>} env */
export function loadLocalEnvironment(directory = process.cwd(), env = process.env) {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.resolve(directory, filename);
    if (!existsSync(envPath)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(envPath, "utf8")))) {
      if (env[key] === undefined) env[key] = value;
    }
  }
}
