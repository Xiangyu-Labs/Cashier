import path from "path";
import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

const resolveAliases = {
  "@": path.resolve(configDirectory, "src"),
  messages: path.resolve(configDirectory, "messages"),
  tests: path.resolve(configDirectory, "tests"),
  "server-only": path.resolve(configDirectory, "tests/stubs/server-only.ts"),
};

const coverageConfig = {
  provider: "v8" as const,
  reporter: ["text", "json", "html"],
  reportsDirectory: "./coverage",
  // The coverage runner creates reportsDirectory/.tmp before Vitest starts.
  clean: false,
  all: true,
  include: ["src/**/*.ts", "src/**/*.tsx"],
  thresholds: {
    lines: 70,
    statements: 68,
    functions: 65,
    branches: 60,
  },
  exclude: [
    "node_modules",
    ".next",
    "tests",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/app/**/loading.tsx",
    "src/app/**/error.tsx",
    "src/app/**/not-found.tsx",
    "src/app/manifest.ts",
    "src/modules/**/ui/**/*.tsx",
  ],
};

const defaultProjectExcludes = ["node_modules", ".next"];
const sharedProjectTestConfig = {
  globals: true,
  env: {
    NODE_ENV: "test" as const,
  },
  pool: "threads" as const,
  fileParallelism: true,
  isolate: true,
  // Database-backed workers create a schema and apply the full migration journal.
  hookTimeout: 60_000,
};

export default defineConfig({
  resolve: {
    alias: resolveAliases,
  },
  test: {
    coverage: coverageConfig,
    projects: [
      defineProject({
        resolve: { alias: resolveAliases },
        test: {
          ...sharedProjectTestConfig,
          name: "unit-general",
          sequence: { groupOrder: 0 },
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
          exclude: defaultProjectExcludes,
          environment: "happy-dom",
          setupFiles: ["./tests/setup.dom.ts"],
          maxWorkers: "100%",
          testTimeout: 10000,
        },
      }),
      defineProject({
        resolve: { alias: resolveAliases },
        test: {
          ...sharedProjectTestConfig,
          name: "integration-node",
          sequence: { groupOrder: 3 },
          include: ["tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
          exclude: [
            ...defaultProjectExcludes,
            "tests/integration/client/category-mutations-optimistic.test.tsx",
            "tests/integration/client/source-document-dialog-flows.test.tsx",
          ],
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          pool: "forks",
          maxWorkers: "50%",
          testTimeout: 30000,
        },
      }),
      defineProject({
        resolve: { alias: resolveAliases },
        test: {
          ...sharedProjectTestConfig,
          name: "integration-dom",
          sequence: { groupOrder: 4 },
          include: [
            "tests/integration/client/category-mutations-optimistic.test.tsx",
            "tests/integration/client/source-document-dialog-flows.test.tsx",
          ],
          exclude: defaultProjectExcludes,
          environment: "happy-dom",
          setupFiles: ["./tests/setup.dom.ts"],
          maxWorkers: 1,
          testTimeout: 30000,
        },
      }),
    ],
  },
});
