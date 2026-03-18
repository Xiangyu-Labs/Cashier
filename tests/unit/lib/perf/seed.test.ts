import { describe, expect, it } from "vitest";

import { loadPerfSeedConfigFromEnv, resolveSqlitePath } from "@/lib/perf/seed";

describe("perf seed config", () => {
  it("uses defaults when env is not provided", () => {
    const config = loadPerfSeedConfigFromEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv);

    expect(config.databaseUrl).toBe("file:./data/perf.sqlite.db");
    expect(config.manifestPath).toBe("perf/.seed.json");
    expect(config.categoryCount).toBe(30);
    expect(config.sourceDocumentCount).toBe(10000);
    expect(config.entryCount).toBe(30000);
    expect(config.taskRunCount).toBe(2000);
    expect(config.daysBack).toBe(365);
    expect(config.chunkSize).toBe(500);
  });

  it("reads explicit overrides from env", () => {
    const config = loadPerfSeedConfigFromEnv({
      NODE_ENV: "test",
      DATABASE_URL: "file:./data/custom-perf.db",
      PERF_SEED_MANIFEST: "perf/custom-seed.json",
      PERF_CATEGORY_COUNT: "12",
      PERF_SOURCE_DOCUMENT_COUNT: "200",
      PERF_ENTRY_COUNT: "400",
      PERF_TASK_RUN_COUNT: "80",
      PERF_DAYS_BACK: "30",
      PERF_INSERT_CHUNK_SIZE: "50",
    } as NodeJS.ProcessEnv);

    expect(config.databaseUrl).toBe("file:./data/custom-perf.db");
    expect(config.manifestPath).toBe("perf/custom-seed.json");
    expect(config.categoryCount).toBe(12);
    expect(config.sourceDocumentCount).toBe(200);
    expect(config.entryCount).toBe(400);
    expect(config.taskRunCount).toBe(80);
    expect(config.daysBack).toBe(30);
    expect(config.chunkSize).toBe(50);
  });

  it("rejects invalid positive integer env values", () => {
    expect(() =>
      loadPerfSeedConfigFromEnv({
        NODE_ENV: "test",
        PERF_ENTRY_COUNT: "0",
      } as NodeJS.ProcessEnv)
    ).toThrow("PERF_ENTRY_COUNT must be a positive integer");
  });

  it("resolves sqlite file urls to local paths", () => {
    expect(resolveSqlitePath("file:./data/perf.sqlite.db")).toBe("./data/perf.sqlite.db");
    expect(resolveSqlitePath("/tmp/perf.sqlite.db")).toBe("/tmp/perf.sqlite.db");
  });
});
