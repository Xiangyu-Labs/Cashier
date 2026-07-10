import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fromRoot = (path: string) => resolve(root, path);

describe("PWA policy", () => {
  it("keeps installation but removes navigation, runtime-data, and push behavior", () => {
    const config = readFileSync(fromRoot("next.config.ts"), "utf8");
    expect(config).toContain("cacheOnFrontEndNav: false");
    expect(config).toContain("aggressiveFrontEndNavCaching: false");
    expect(config).toContain("cacheStartUrl: false");
    expect(config).toContain("dynamicStartUrl: false");
    expect(config).toContain("runtimeCaching: []");
    expect(config).not.toContain("importScripts");
    expect(existsSync(fromRoot("public/push-worker.js"))).toBe(false);
    expect(existsSync(fromRoot("src/app/manifest.ts"))).toBe(true);
  });
});
