import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { CategorySection } from "@/modules/ledger/ui/CategorySection";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const category: EntryCategory = {
  id: "category-1",
  ledgerId: "ledger-1",
  name: "Meals",
  description: null,
  icon: null,
  sortOrder: 0,
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z",
  deletedAt: null,
};

describe("CategorySection", () => {
  it("keeps category changes in a draft and submits them atomically", async () => {
    const onSaveCategories = vi
      .fn()
      .mockResolvedValue([
        category,
        { ...category, id: "category-2", name: "Travel", sortOrder: 1 },
      ]);
    render(<CategorySection categories={[category]} onSaveCategories={onSaveCategories} />);

    fireEvent.click(screen.getByRole("button", { name: "manageCategories" }));
    fireEvent.change(screen.getByLabelText("newCategoryPlaceholder"), {
      target: { value: "Travel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "addCategory" }));

    expect(onSaveCategories).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(onSaveCategories).toHaveBeenCalledOnce());
    expect(onSaveCategories).toHaveBeenCalledWith({
      expectedRevision: expect.stringMatching(/^[0-9a-f]{64}$/),
      categories: [
        {
          id: "category-1",
          name: "Meals",
          description: null,
          icon: null,
        },
        {
          clientId: expect.any(String),
          name: "Travel",
          description: null,
          icon: null,
        },
      ],
    });
  });
});
