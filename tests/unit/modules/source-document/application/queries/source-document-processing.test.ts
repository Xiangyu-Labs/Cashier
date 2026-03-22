import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PersistenceModule from "@/persistence";
import type * as DrizzleOrmModule from "drizzle-orm";

const { taskRunsFindManyMock } = vi.hoisted(() => ({
  taskRunsFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      taskRuns: {
        findMany: taskRunsFindManyMock,
      },
    },
  },
}));

vi.mock("@/persistence", async () => {
  const actual = await vi.importActual<typeof PersistenceModule>("@/persistence");
  return {
    ...actual,
    taskRuns: {
      deletedAt: "taskRuns.deletedAt",
      scopeId: "taskRuns.scopeId",
      status: "taskRuns.status",
      createdAt: "taskRuns.createdAt",
    },
  };
});

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof DrizzleOrmModule>("drizzle-orm");
  return {
    ...actual,
    and: vi.fn((...parts: unknown[]) => ({ and: parts })),
    desc: vi.fn((column: unknown) => ({ desc: column })),
    eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
    inArray: vi.fn((column: unknown, values: unknown[]) => ({ inArray: [column, values] })),
    isNull: vi.fn((column: unknown) => ({ isNull: column })),
  };
});

import {
  getProcessingStats,
  listProcessingTasks,
} from "../../../../../../src/modules/source-document/application/queries/source-document-processing";

describe("source-document-processing queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists tasks with ISO date serialization", async () => {
    taskRunsFindManyMock.mockResolvedValueOnce([
      {
        id: "task-1",
        type: "parse_source_document",
        title: "Parse source document",
        input: { ledgerId: "ledger-1" },
        deduplicationKey: null,
        scopeId: "ledger-1",
        entityType: "source_document",
        entityId: "doc-1",
        status: "running",
        error: null,
        progress: null,
        tokenUsage: null,
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        updatedAt: new Date("2026-03-20T11:00:00.000Z"),
        startedAt: new Date("2026-03-20T10:05:00.000Z"),
        completedAt: null,
        deletedAt: null,
      },
    ]);

    const result = await listProcessingTasks("ledger-1", { activeOnly: true });

    expect(taskRunsFindManyMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        id: "task-1",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T11:00:00.000Z",
        startedAt: "2026-03-20T10:05:00.000Z",
        completedAt: null,
      }),
    ]);
  });

  it("aggregates only valid completed token usage", async () => {
    taskRunsFindManyMock.mockResolvedValueOnce([
      {
        tokenUsage: { total: { input: 100, output: 20 } },
      },
      {
        tokenUsage: { total: { input: 50 } },
      },
      {
        tokenUsage: { total: { input: "bad" } },
      },
    ]);

    const result = await getProcessingStats("ledger-1");

    expect(result).toEqual({
      totalTokens: 170,
      totalInputTokens: 150,
      totalOutputTokens: 20,
      taskCount: 3,
      averageTokensPerTask: 57,
    });
  });
});
