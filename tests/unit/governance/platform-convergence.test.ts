import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (path: string) => existsSync(resolve(root, path));
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("platform convergence", () => {
  it("keeps PostgreSQL as the only migration history", () => {
    expect(exists("src/persistence/migrations")).toBe(false);
    const packageJson = read("package.json");
    expect(packageJson).not.toContain("better-sqlite3");
  });

  it("does not expose v2 or browser proxy upload routes", () => {
    expect(exists("src/app/api/v2")).toBe(false);
    expect(exists("src/app/api/uploads")).toBe(false);
    expect(exists("src/app/api/stored-files/upload-targets")).toBe(false);
    expect(read("src/proxy.ts")).not.toContain("api/v2");
  });

  it("documents v1 as stable without a sunset", () => {
    const compatibility = read("src/app/api/v1/_shared/compatibility.ts");
    expect(compatibility).toContain('status: "stable"');
    expect(compatibility).not.toContain("additiveUntil");
    expect(compatibility).not.toContain("2026-10-13");
  });
});
