import path from "path";
import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export const resolveAliases = {
  "@": path.resolve(configDirectory, "src"),
  messages: path.resolve(configDirectory, "messages"),
  tests: path.resolve(configDirectory, "tests"),
};

export const coverageConfig = {
  provider: "v8" as const,
  reporter: ["text", "json", "html"],
  reportsDirectory: "./coverage",
  // The coverage runner creates reportsDirectory/.tmp before Vitest starts.
  clean: false,
  all: true,
  include: ["src/**/*.ts", "src/**/*.tsx"],
  thresholds: {
    lines: 50,
    statements: 50,
    functions: 50,
    branches: 50,
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

export const defaultProjectExcludes = ["node_modules", ".next"];

export const sharedProjectTestConfig = {
  globals: true,
  env: {
    NODE_ENV: "test" as const,
  },
  pool: "threads" as const,
  fileParallelism: true,
  isolate: true,
};

export const dbUnitFiles = [
  "tests/unit/application/adapters/postgres/api-rate-limit.test.ts",
  "tests/unit/application/adapters/postgres/read-models.test.ts",
  "tests/unit/auth/application/queries/get-session-user.test.ts",
  "tests/unit/auth/application/use-cases/registration-policy.test.ts",
  "tests/unit/auth/repositories/otp-repository.test.ts",
  "tests/unit/auth/otp-rate-limit.test.ts",
  "tests/unit/auth/services/otp-verification.test.ts",
  "tests/unit/currency/ExchangeRateService.test.ts",
  "tests/unit/db/ledger-entries.test.ts",
  "tests/unit/ledger/application/queries/get-ledger-entry-detail.test.ts",
  "tests/unit/ledger/application/queries/list-service-credentials.test.ts",
  "tests/unit/ledger/application/services/authenticate-service-credential.test.ts",
  "tests/unit/ledger/application/services/resolve-ledger-for-service-credential.test.ts",
  "tests/unit/scripts/hash-service-credentials.test.ts",
  "tests/unit/ledger/application/use-cases/create-default-ledger.test.ts",
  "tests/unit/ledger/server/actions/delete.test.ts",
  "tests/unit/lib/auth-actions.test.ts",
  "tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts",
];

export const unitProjects = [
  defineProject({
    resolve: {
      alias: resolveAliases,
    },
    test: {
      ...sharedProjectTestConfig,
      name: "unit-general",
      sequence: {
        groupOrder: 0,
      },
      include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
      exclude: [...defaultProjectExcludes, ...dbUnitFiles],
      environment: "happy-dom",
      setupFiles: ["./tests/setup.dom.ts"],
      maxWorkers: "100%",
      testTimeout: 10000,
    },
  }),
  defineProject({
    resolve: {
      alias: resolveAliases,
    },
    test: {
      ...sharedProjectTestConfig,
      name: "unit-db",
      sequence: {
        groupOrder: 1,
      },
      include: dbUnitFiles,
      exclude: defaultProjectExcludes,
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      maxWorkers: "50%",
      testTimeout: 30000,
    },
  }),
];

export const integrationProjects = [
  defineProject({
    resolve: {
      alias: resolveAliases,
    },
    test: {
      ...sharedProjectTestConfig,
      name: "integration-node",
      sequence: {
        groupOrder: 3,
      },
      include: ["tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
      exclude: [
        ...defaultProjectExcludes,
        "tests/integration/client/category-mutations-optimistic.test.tsx",
      ],
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      pool: "forks",
      maxWorkers: "50%",
      testTimeout: 30000,
    },
  }),
  defineProject({
    resolve: {
      alias: resolveAliases,
    },
    test: {
      ...sharedProjectTestConfig,
      name: "integration-dom",
      sequence: {
        groupOrder: 4,
      },
      include: ["tests/integration/client/category-mutations-optimistic.test.tsx"],
      exclude: defaultProjectExcludes,
      environment: "happy-dom",
      setupFiles: ["./tests/setup.dom.ts"],
      maxWorkers: 1,
      testTimeout: 30000,
    },
  }),
];
