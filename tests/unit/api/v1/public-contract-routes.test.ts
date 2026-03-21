import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";
import type { CategoriesResponseDto, EntryCategoryWithCountDto } from "@/modules/ledger/contracts";
import type {
  QueueItem,
  TaskQueueItemsResponseDto,
  TaskQueueResult,
  TaskQueueStats,
  TaskQueueStatsResponseDto,
} from "@/modules/task-queue/contracts";

const {
  handleApiV1RouteMock,
  listEntryCategoriesMock,
  getTaskQueueForAuthorizedLedgerMock,
} = vi.hoisted(() => ({
  handleApiV1RouteMock: vi.fn(),
  listEntryCategoriesMock: vi.fn(),
  getTaskQueueForAuthorizedLedgerMock: vi.fn(),
}));

vi.mock("@/app/api/v1/_shared/route-helper", () => ({
  handleApiV1Route: handleApiV1RouteMock,
}));

vi.mock("@/modules/ledger/queries", () => ({
  listEntryCategories: listEntryCategoriesMock,
}));

vi.mock("@/modules/task-queue/actions", () => ({
  getTaskQueueForAuthorizedLedger: getTaskQueueForAuthorizedLedgerMock,
}));

import { GET as getCategories } from "@/app/api/v1/categories/route";
import { GET as getTaskItems } from "@/app/api/v1/task/items/route";
import { GET as getTaskStats } from "@/app/api/v1/task/stats/route";

function createRequest(url: string): NextRequest {
  return new Request(url, { method: "GET" }) as unknown as NextRequest;
}

describe("api/v1 public response contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleApiV1RouteMock.mockImplementation(
      async (
        request: NextRequest,
        {
          handler,
        }: {
          handler: (ctx: {
            credential: { id: string; ledgerId: string };
            key: string;
            request: NextRequest;
          }) => Promise<NextResponse>;
        }
      ) =>
        handler({
          credential: { id: "cred-1", ledgerId: "ledger-1" },
          key: "test-key",
          request,
        })
    );
  });

  it("returns categories with the explicit response DTO envelope", async () => {
    const categories: EntryCategoryWithCountDto[] = [
      {
        id: "cat-1",
        ledgerId: "ledger-1",
        name: "Food",
        description: null,
        icon: "utensils",
        sortOrder: 1,
        isEditable: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        entryCount: 3,
      },
    ];
    listEntryCategoriesMock.mockResolvedValue(categories);

    const response = await getCategories(createRequest("http://localhost:3000/api/v1/categories"));
    const body = (await response.json()) as CategoriesResponseDto;

    expect(body).toEqual({ categories });
    expect(Object.keys(body)).toEqual(["categories"]);
  });

  it("returns task items with the explicit response DTO envelope", async () => {
    const items: QueueItem[] = [
      {
        id: "task-1",
        kind: "task",
        status: "running",
        title: "Parse document",
        createdAt: "2026-01-01T00:00:00.000Z",
        taskId: "task-1",
        taskType: "parse_source_document",
      },
    ];
    const result: TaskQueueResult = {
      items,
      stats: {
        pendingCount: 0,
        runningCount: 1,
        failedCount: 0,
        completedCount: 0,
        anomalyCount: 0,
        total: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgTokensPerTask: 0,
      },
    };
    getTaskQueueForAuthorizedLedgerMock.mockResolvedValue(result);

    const response = await getTaskItems(createRequest("http://localhost:3000/api/v1/task/items"));
    const body = (await response.json()) as TaskQueueItemsResponseDto;

    expect(body).toEqual({ items });
    expect(Object.keys(body)).toEqual(["items"]);
  });

  it("returns task stats with the explicit response DTO envelope", async () => {
    const stats: TaskQueueStats = {
      pendingCount: 1,
      runningCount: 2,
      failedCount: 3,
      completedCount: 4,
      anomalyCount: 5,
      total: 15,
      totalInputTokens: 100,
      totalOutputTokens: 200,
      avgTokensPerTask: 75,
    };
    getTaskQueueForAuthorizedLedgerMock.mockResolvedValue({
      items: [],
      stats,
    } satisfies TaskQueueResult);

    const response = await getTaskStats(createRequest("http://localhost:3000/api/v1/task/stats"));
    const body = (await response.json()) as TaskQueueStatsResponseDto;

    expect(body).toEqual({ stats });
    expect(Object.keys(body)).toEqual(["stats"]);
  });
});
