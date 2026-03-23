import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ENV_CATALOG, FRAMEWORK_ENV_KEYS } from "@/lib/env/catalog";

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);

    if (entry === "node_modules" || entry === ".next") {
      return [];
    }

    if (statSync(fullPath).isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("env catalog coverage", () => {
  it("documents every application-managed env key used by source files", () => {
    const example = readFileSync(path.resolve(".env.example"), "utf8");
    const documentedKeys = new Set(APP_ENV_CATALOG.map((entry) => entry.name));
    const usedKeys = new Set<string>();

    for (const file of collectSourceFiles(path.resolve("src"))) {
      const content = readFileSync(file, "utf8");

      for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        usedKeys.add(match[1]);
      }
    }

    for (const key of usedKeys) {
      if (FRAMEWORK_ENV_KEYS.has(key)) {
        continue;
      }

      expect(documentedKeys).toContain(key);
      expect(example).toMatch(new RegExp(`# Required:\\s+.+\\n# Default:\\s+.+\\n${key}=`, "m"));
    }
  });
});
