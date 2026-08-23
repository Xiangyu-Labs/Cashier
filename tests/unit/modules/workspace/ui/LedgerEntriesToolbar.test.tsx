import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PeriodParams } from "@/lib/period-utils";
import { LedgerEntriesToolbar } from "@/modules/workspace/ui/LedgerEntriesToolbar";

const defaultPeriodParams: PeriodParams = { period: "thisMonth" };

const defaultProps = {
  isSelectionMode: false,
  isAllSelected: false,
  selectedCount: 0,
  onToggleSelectionMode: vi.fn(),
  onSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
  filters: {} as const,
  onFiltersChange: vi.fn(),
  periodParams: defaultPeriodParams,
  onPeriodChange: vi.fn(),
  totalPrefix: "Total",
  mainCurrency: "CNY",
  filteredTotal: "123.45",
};

describe("LedgerEntriesToolbar", () => {
  it("renders without crashing with default props", () => {
    render(<LedgerEntriesToolbar {...defaultProps} />);

    // Should render the selection toggle button (select mode, not cancel)
    expect(screen.getByTitle("选择")).toBeDefined();

    // Should render the total
    expect(screen.getByText("Total ¥123.45")).toBeDefined();
  });

  it("renders in selection mode with checkbox and clear button", () => {
    render(<LedgerEntriesToolbar {...defaultProps} isSelectionMode={true} selectedCount={3} />);

    // Should render the selection checkbox area
    expect(screen.getByText(/已选择 3 项/)).toBeDefined();
    // Cancel button title in selection mode
    expect(screen.getByTitle("取消")).toBeDefined();
    expect(screen.queryByText("Total ¥123.45")).not.toBeInTheDocument();
  });

  it("does not render status summary when no statuses are active", () => {
    render(<LedgerEntriesToolbar {...defaultProps} />);

    // No status summary should be rendered
    expect(screen.queryByText(/状态：/)).not.toBeInTheDocument();
  });

  it("keeps active status details inside the filter panel", () => {
    render(<LedgerEntriesToolbar {...defaultProps} filters={{ statuses: ["completed"] }} />);

    expect(screen.queryByText(/状态：/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "筛选 1" })).toBeDefined();
  });

  it("does not render preset summaries outside the filter panel", () => {
    render(
      <LedgerEntriesToolbar
        {...defaultProps}
        filters={{ statuses: ["candidate_pending", "anomaly", "failed"] }}
      />
    );

    expect(screen.queryByText(/待处理/)).not.toBeInTheDocument();
  });

  it("does not render an external status reset control", () => {
    render(<LedgerEntriesToolbar {...defaultProps} filters={{ statuses: ["completed"] }} />);
    expect(screen.queryByRole("button", { name: "全部状态" })).not.toBeInTheDocument();
  });

  it("does not render EntryFilterPanel in selection mode", () => {
    render(<LedgerEntriesToolbar {...defaultProps} isSelectionMode={true} selectedCount={1} />);

    // EntryFilterPanel should not be rendered in selection mode
    expect(screen.queryByRole("button", { name: "筛选" })).not.toBeInTheDocument();
  });

  it("renders only the amount when a filtered result omits the prefix", () => {
    const { totalPrefix: _totalPrefix, ...filteredProps } = defaultProps;
    render(<LedgerEntriesToolbar {...filteredProps} />);

    expect(screen.getByText("¥123.45")).toBeInTheDocument();
    expect(screen.queryByText(/Filtered total/i)).not.toBeInTheDocument();
  });

  it("places synchronization status in its own mobile row", () => {
    render(<LedgerEntriesToolbar {...defaultProps} syncStatus="Updated just now" />);

    expect(screen.getByTestId("toolbar-sync-status")).toHaveClass("basis-full");
    expect(screen.getByTestId("toolbar-sync-status")).toHaveTextContent("Updated just now");
  });
});
