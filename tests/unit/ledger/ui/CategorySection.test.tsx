import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CategorySection } from "@/modules/ledger/ui/CategorySection";
import type { EntryCategoryDto as EntryCategory } from "@/modules/ledger/contracts";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/editable-field", () => ({
  EditableField: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock("@/components/ui/icon-picker", () => ({
  IconPicker: () => <span>icon</span>,
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: {},
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: <T,>(items: T[], from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item !== undefined) {
      next.splice(to, 0, item);
    }
    return next;
  },
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

describe("CategorySection", () => {
  it("clears create input after a successful category create signal", async () => {
    const onCreateCategory = vi.fn();
    const categories: EntryCategory[] = [
      {
        id: "cat-1",
        ledgerId: "ledger-1",
        name: "Food",
        description: null,
        icon: "Utensils",
        sortOrder: 1,
        isEditable: true,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        deletedAt: null,
      },
    ];

    const successSignalA = () => {};
    const successSignalB = () => {};

    const { rerender } = render(
      <CategorySection
        categories={categories}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onReorderCategories={vi.fn()}
        onCategoryCreated={successSignalA}
      />
    );

    const input = screen.getByPlaceholderText("newCategoryPlaceholder") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  New Category  " } });
    fireEvent.click(screen.getByText("addCategory"));

    expect(onCreateCategory).toHaveBeenCalledWith("New Category");
    expect(input.value).toBe("  New Category  ");

    rerender(
      <CategorySection
        categories={categories}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onReorderCategories={vi.fn()}
        onCategoryCreated={successSignalB}
      />
    );

    await waitFor(() => {
      expect((screen.getByPlaceholderText("newCategoryPlaceholder") as HTMLInputElement).value).toBe(
        ""
      );
    });
  });
});
