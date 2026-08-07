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
  isEditable: true,
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z",
  deletedAt: null,
};

describe("CategorySection", () => {
  it("makes create, edit, delete, and reorder controls mutually exclusive", async () => {
    let resolveCreate!: (value: EntryCategory) => void;
    const onCreateCategory = vi.fn(
      () =>
        new Promise<EntryCategory>((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(
      <CategorySection
        categories={[category]}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onReorderCategories={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "manageCategories" }));
    fireEvent.change(screen.getByLabelText("newCategoryPlaceholder"), {
      target: { value: "Travel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "addCategory" }));

    await waitFor(() => expect(screen.getByLabelText("newCategoryPlaceholder")).toBeDisabled());
    expect(screen.getByRole("button", { name: "editCategory" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "deleteCategory" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "addCategory" }));
    expect(onCreateCategory).toHaveBeenCalledTimes(1);

    resolveCreate({ ...category, id: "category-2", name: "Travel", sortOrder: 1 });
    await waitFor(() => expect(screen.getByLabelText("newCategoryPlaceholder")).not.toBeDisabled());
  });
});
