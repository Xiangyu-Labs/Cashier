import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === ".next") return [];
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("backend simplification governance", () => {
  it("removes unused compatibility modules from production source", () => {
    const removedPaths = [
      "src/lib/ai/dual-gpt-runner.ts",
      "src/lib/serialization/index.ts",
      "src/lib/serialization/types.ts",
      "src/lib/serialization/utils.ts",
      "src/lib/storage/memory.ts",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.resolve(repoRoot, relativePath)), relativePath).toBe(false);
    }
  });

  it("does not import removed compatibility modules from source files", () => {
    const forbiddenImports = [
      "@/lib/serialization",
      "@/lib/ai/dual-gpt-runner",
      "@/lib/storage/memory",
    ];
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const source = readFileSync(file, "utf8");
      for (const forbiddenImport of forbiddenImports) {
        if (source.includes(forbiddenImport)) {
          offenders.push(`${path.relative(repoRoot, file)} imports ${forbiddenImport}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not use backend query/use-case barrels from production source", () => {
    const forbiddenImports = [
      "@/modules/source-document/queries",
      "@/modules/ledger/queries",
      "@/modules/ledger/use-cases",
    ];
    const allowedFiles = new Set([
      "src/modules/source-document/actions.ts",
      "src/modules/ledger/actions.ts",
    ]);
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const relative = path.relative(repoRoot, file);
      if (allowedFiles.has(relative)) continue;
      const source = readFileSync(file, "utf8");
      for (const forbiddenImport of forbiddenImports) {
        if (source.includes(forbiddenImport)) {
          offenders.push(`${relative} imports ${forbiddenImport}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
