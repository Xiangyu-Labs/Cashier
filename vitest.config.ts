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
    // 启用并行执行
    pool: "threads",
    // 限制并发数为 CPU 核数的 50%，避免 SQLite 锁竞争
    maxWorkers: "50%",
    // 保持测试隔离
    isolate: true,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "messages": path.resolve(__dirname, "messages"),
      "tests": path.resolve(__dirname, "tests"),
    },
  },
});
