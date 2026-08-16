import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { LedgerEntriesActions } from "@/modules/ledger/ui/batch-action-toolbar/LedgerEntriesActions";

const category: EntryCategory = {
  id: "category-1",
  ledgerId: "ledger-1",
  name: "餐饮",
  description: null,
  icon: "Utensils",
  sortOrder: 0,
  isEditable: true,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  deletedAt: null,
};

function renderActions() {
  return render(
    <LedgerEntriesActions
      categories={[category]}
      preferredCurrencies={["USD"]}
      isProcessing={false}
      isChangingCategory={false}
      isChangingCurrency={false}
      onChangeCategory={vi.fn()}
      onChangeCurrency={vi.fn()}
    />
  );
}

describe("LedgerEntriesActions dropdown triggers", () => {
  it("renders the optional split command only when provided", async () => {
    const onSplit = vi.fn();
    const { rerender } = render(
      <LedgerEntriesActions
        categories={[category]}
        preferredCurrencies={["USD"]}
        isProcessing={false}
        isChangingCategory={false}
        isChangingCurrency={false}
        onChangeCategory={vi.fn()}
        onChangeCurrency={vi.fn()}
        onSplit={onSplit}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /拆分|split/i }));
    expect(onSplit).toHaveBeenCalledOnce();

    rerender(
      <LedgerEntriesActions
        categories={[category]}
        preferredCurrencies={["USD"]}
        isProcessing={false}
        isChangingCategory={false}
        isChangingCurrency={false}
        onChangeCategory={vi.fn()}
        onChangeCurrency={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /拆分|split/i })).not.toBeInTheDocument();
  });

  it("does not open the category menu during a press or drag outside", () => {
    renderActions();
    const trigger = screen.getByRole("button", { name: /指定分类|set category/i });

    fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.pointerUp(document, { button: 0, pointerId: 1 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0, pointerId: 2 });
    fireEvent.pointerUp(trigger, { button: 0, pointerId: 2 });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("opens and closes the category menu after a complete click", async () => {
    const user = userEvent.setup();
    renderActions();
    const trigger = screen.getByRole("button", { name: /指定分类|set category/i });

    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /餐饮/ })).toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("does not open the currency menu during a press or drag outside", () => {
    renderActions();
    const trigger = screen.getByRole("button", { name: /修改货币|set currency/i });

    fireEvent.pointerDown(trigger, { button: 0, pointerId: 3 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.pointerUp(document, { button: 0, pointerId: 3 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0, pointerId: 4 });
    fireEvent.pointerUp(trigger, { button: 0, pointerId: 4 });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("opens the currency menu after a complete click", async () => {
    const user = userEvent.setup();
    renderActions();
    const trigger = screen.getByRole("button", { name: /修改货币|set currency/i });

    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "USD" })).toBeInTheDocument();
  });
});
