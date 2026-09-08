import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INTERNAL_SECRET_NAMES = [
  "AUTH_SECRET",
  "API_KEY_PEPPER",
  "RATE_LIMIT_PEPPER",
  "AUTH_OTP_PEPPER",
] as const;

describe("local environment template", () => {
  it("provides explicit local-only internal secrets for copy-and-run development", () => {
    const template = readFileSync(resolve(process.cwd(), ".env.local.example"), "utf8");
    const environment = parseEnv(template);

    for (const name of INTERNAL_SECRET_NAMES) {
      expect(environment[name]).toContain("cashier-local-only-");
    }
  });

  it("does not put fixed internal secrets in the external deployment template", () => {
    const template = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const environment = parseEnv(template);

    for (const name of INTERNAL_SECRET_NAMES) {
      expect(environment[name]).toBeUndefined();
    }
  });
});
