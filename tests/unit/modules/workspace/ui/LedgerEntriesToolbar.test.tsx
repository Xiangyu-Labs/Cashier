import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LedgerEntriesToolbar } from "@/modules/workspace/ui/LedgerEntriesToolbar";

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/modules/ledger/ui", () => ({
  EntryFilterPanel: () => <div data-testid="entry-filter-panel" />,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean | "indeterminate";
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="toolbar-master-checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : checked ? "true" : "false"}
      onClick={() => onCheckedChange?.(!(checked === true))}
    />
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === "BatchActions" && key === "selected") {
      return `已选择 ${String(values?.count ?? "")} 项`;
    }
    const dict: Record<string, string> = {
      select: "选择",
      cancelSelect: "取消",
    };
    return dict[key] ?? key;
  },
}));

describe("LedgerEntriesToolbar", () => {
  it("uses a master checkbox in selection mode and toggles loaded selection", () => {
    const onSelectAll = vi.fn();

    render(
      <LedgerEntriesToolbar
        isSelectionMode={true}
        selectedCount={1}
        onToggleSelectionMode={vi.fn()}
        onSelectAll={onSelectAll}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        periodParams={{ period: "thisMonth" }}
        onPeriodChange={vi.fn()}
        filteredTotalLabel="合计"
        mainCurrency="CNY"
        filteredTotal={12}
      />
    );

    fireEvent.click(screen.getByTestId("toolbar-master-checkbox"));

    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(screen.getByText("已选择 1 项")).toBeTruthy();
  });

  it("clears loaded selection from the master checkbox when all loaded items are selected", () => {
    const onClearSelection = vi.fn();

    render(
      <LedgerEntriesToolbar
        isSelectionMode={true}
        selectedCount={2}
        onToggleSelectionMode={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={onClearSelection}
        isAllSelected={true}
        filters={{}}
        onFiltersChange={vi.fn()}
        periodParams={{ period: "thisMonth" }}
        onPeriodChange={vi.fn()}
        filteredTotalLabel="合计"
        mainCurrency="CNY"
        filteredTotal={12}
      />
    );

    fireEvent.click(screen.getByTestId("toolbar-master-checkbox"));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("hides the filter trigger while selection mode is active", () => {
    render(
      <LedgerEntriesToolbar
        isSelectionMode={true}
        selectedCount={1}
        onToggleSelectionMode={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        filters={{}}
        onFiltersChange={vi.fn()}
        periodParams={{ period: "thisMonth" }}
        onPeriodChange={vi.fn()}
        filteredTotalLabel="合计"
        mainCurrency="CNY"
        filteredTotal={12}
      />
    );

    expect(screen.queryByTestId("entry-filter-panel")).toBeNull();
  });
});
