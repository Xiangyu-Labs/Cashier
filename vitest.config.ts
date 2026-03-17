import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./tests/setup.ts"],
    env: {
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", ".next", "tests"],
    },
    // Enable parallel test execution with per-file database isolation
    pool: "threads",
    fileParallelism: true,
    maxWorkers: "50%",
    // 保持测试隔离
    isolate: true,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      messages: path.resolve(__dirname, "messages"),
      tests: path.resolve(__dirname, "tests"),
    },
  },
});
