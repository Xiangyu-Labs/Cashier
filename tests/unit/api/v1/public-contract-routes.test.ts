import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";
import type { CategoriesResponseDto, EntryCategoryWithCountDto } from "@/modules/ledger/contracts";

const { handleApiV1RouteMock, listEntryCategoriesMock } = vi.hoisted(() => ({
  handleApiV1RouteMock: vi.fn(),
  listEntryCategoriesMock: vi.fn(),
}));

vi.mock("@/app/api/v1/_shared/route-helper", () => ({
  handleApiV1Route: handleApiV1RouteMock,
}));

vi.mock("@/modules/ledger/application/queries/list-entry-categories", () => ({
  listEntryCategories: listEntryCategoriesMock,
}));

import { GET as getCategories } from "@/app/api/v1/categories/route";

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
});
