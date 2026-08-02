import { describe, expect, it, vi } from "vitest";

const listEntryCategoriesWithCountMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/ledger/application/use-cases/list-entry-categories-with-count", () => ({
  listEntryCategoriesWithCount: listEntryCategoriesWithCountMock,
}));

import { listEntryCategories as listEntryCategoriesUseCase } from "@/modules/ledger/application/queries/list-entry-categories";
import type { CategoryPort } from "@/application/contracts";

const categories = {} as CategoryPort;
const listEntryCategories = (ledgerId: string) => listEntryCategoriesUseCase(ledgerId, categories);

describe("listEntryCategories", () => {
  it("delegates to listEntryCategoriesWithCount", async () => {
    listEntryCategoriesWithCountMock.mockResolvedValueOnce([{ id: "cat-1", entryCount: 3 }]);

    await expect(listEntryCategories("ledger-1")).resolves.toEqual([
      { id: "cat-1", entryCount: 3 },
    ]);
    expect(listEntryCategoriesWithCountMock).toHaveBeenCalledWith("ledger-1", categories);
  });
});
