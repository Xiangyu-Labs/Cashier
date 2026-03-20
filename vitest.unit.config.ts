import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Only run unit tests
      include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
      // Unit tests don't need database, can use higher parallelism
      maxWorkers: "100%",
      // Shorter timeout for unit tests
      testTimeout: 10000,
      // Keep happy-dom for component tests
    },
  })
);
