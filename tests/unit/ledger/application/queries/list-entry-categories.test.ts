import { describe, expect, it, vi } from "vitest";

import { listEntryCategories as listEntryCategoriesUseCase } from "@/modules/ledger/application/queries/list-entry-categories";
import type { CategoryPort } from "@/application/contracts";

const categories: Pick<CategoryPort, "listWithCount"> = { listWithCount: vi.fn() };
const listEntryCategories = (ledgerId: string) => listEntryCategoriesUseCase(ledgerId, categories);

describe("listEntryCategories", () => {
  it("maps the category read contract to the public DTO", async () => {
    const row = {
      id: "cat-1",
      ledgerId: "ledger-1",
      name: "Food",
      description: null,
      icon: null,
      sortOrder: 0,
      createdAt: "now",
      updatedAt: "now",
      entryCount: 3,
    };
    vi.mocked(categories.listWithCount).mockResolvedValueOnce([row]);

    await expect(listEntryCategories("ledger-1")).resolves.toEqual([{ ...row, deletedAt: null }]);
    expect(categories.listWithCount).toHaveBeenCalledWith("ledger-1");
  });
});
