import { describe, expect, it, vi } from "vitest";

const listEntryCategoriesWithCountMock = vi.hoisted(() => vi.fn());

vi.mock("../use-cases/list-entry-categories-with-count", () => ({
  listEntryCategoriesWithCount: listEntryCategoriesWithCountMock,
}));

import { listEntryCategories } from "./list-entry-categories";

describe("listEntryCategories", () => {
  it("delegates to listEntryCategoriesWithCount", async () => {
    listEntryCategoriesWithCountMock.mockResolvedValueOnce([{ id: "cat-1", entryCount: 3 }]);

    await expect(listEntryCategories("ledger-1")).resolves.toEqual([{ id: "cat-1", entryCount: 3 }]);
    expect(listEntryCategoriesWithCountMock).toHaveBeenCalledWith("ledger-1");
  });
});
