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

  it("initializes exchange-rate orchestration only from bootstrap code", () => {
    const allowedFiles = new Set([
      "src/instrumentation.ts",
      "src/lib/orchestration/exchange-rate-ledger-recalculation.ts",
    ]);
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const relative = path.relative(repoRoot, file);
      if (allowedFiles.has(relative)) continue;
      const source = readFileSync(file, "utf8");
      if (source.includes("initializeExchangeRateLedgerRecalculationOrchestration")) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps env runtime sources single-owner", () => {
    const removedPaths = [
      "src/lib/env/defaults.ts",
      "src/lib/env/catalog.ts",
      "tests/unit/lib/env/catalog.test.ts",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.resolve(repoRoot, relativePath)), relativePath).toBe(false);
    }

    const startupSource = readFileSync(path.resolve(repoRoot, "src/lib/env/startup.ts"), "utf8");
    expect(startupSource).toContain("export const ENV_DEFAULTS");
  });

  it("moves task runtime out of flow and removes Flow compatibility names", () => {
    expect(existsSync(path.resolve(repoRoot, "src/lib/flow"))).toBe(false);
    expect(existsSync(path.resolve(repoRoot, "src/lib/tasks"))).toBe(true);
    expect(existsSync(path.resolve(repoRoot, "tests/integration/flow"))).toBe(false);
    expect(existsSync(path.resolve(repoRoot, "tests/unit/lib/flow"))).toBe(false);
    expect(existsSync(path.resolve(repoRoot, "tests/integration/tasks"))).toBe(true);
    expect(existsSync(path.resolve(repoRoot, "tests/unit/lib/tasks"))).toBe(true);

    const forbiddenTerms = [
      "FlowEngine",
      "FlowEngineConfig",
      "FlowContext",
      "FlowTaskHandler",
      "FlowTaskDefinition",
      "FlowTaskMetadata",
      "createFlowEngine",
      "initializeDefaultFlowRuntime",
      "getFlowEngine",
      "submitFlowTask",
      "cancelFlowTask",
      "resetFlowRuntime",
      "@/lib/flow",
    ];
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const relative = path.relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      for (const term of forbiddenTerms) {
        if (source.includes(term)) {
          offenders.push(`${relative} contains ${term}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("deletes optional backend barrels that only add indirection", () => {
    const removedPaths = [
      "src/modules/auth/use-cases.ts",
      "src/modules/auth/queries.ts",
      "src/modules/currency/use-cases.ts",
      "src/modules/stats/queries.ts",
      "src/modules/workspace/use-cases.ts",
      "src/modules/workspace/queries.ts",
      "src/modules/source-document/application/queries/source-document-queries.ts",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.resolve(repoRoot, relativePath)), relativePath).toBe(false);
    }
  });

  it("keeps API v1 routes on the shared route helper", () => {
    const apiDir = path.resolve(repoRoot, "src/app/api/v1");
    const routeFiles = collectSourceFiles(apiDir).filter((file) => file.endsWith("/route.ts"));
    const offenders = routeFiles
      .map((file) => {
        const relative = path.relative(repoRoot, file);
        const source = readFileSync(file, "utf8");
        return source.includes("handleApiV1Route") ? null : relative;
      })
      .filter((value): value is string => value != null);

    expect(offenders).toEqual([]);
  });

  it("keeps UI code on module action entrypoints instead of deep server-action imports", () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const relative = path.relative(repoRoot, file);
      if (!relative.includes("/ui/") && !relative.includes("/hooks/")) continue;

      const source = readFileSync(file, "utf8");
      if (source.includes("/server-actions/")) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
});
