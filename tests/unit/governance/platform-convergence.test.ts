import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { apiV1Compatibility } from "@/app/api/v1/_shared/compatibility";

const root = process.cwd();
const exists = (path: string) => existsSync(resolve(root, path));
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("platform convergence", () => {
  it("keeps PostgreSQL as the only migration history", () => {
    expect(exists("src/persistence/migrations")).toBe(false);
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(packageJson.dependencies).not.toHaveProperty("better-sqlite3");
    expect(packageJson.devDependencies).not.toHaveProperty("better-sqlite3");
  });

  it("does not expose v2 or browser proxy upload routes", () => {
    expect(exists("src/app/api/v2")).toBe(false);
    expect(exists("src/app/api/uploads")).toBe(false);
    expect(exists("src/app/api/stored-files/upload-targets")).toBe(false);
    expect(read("src/proxy.ts")).not.toContain("api/v2");
  });

  it("documents v1 as stable without a sunset", () => {
    expect(apiV1Compatibility).toEqual({ version: "v1", status: "stable" });
    expect(apiV1Compatibility).not.toHaveProperty("additiveUntil");
  });
});
