import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  filteredTotalLabel: "Total",
  mainCurrency: "CNY",
  filteredTotal: 123.45,
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
  });

  it("does not render status summary when no statuses are active", () => {
    render(<LedgerEntriesToolbar {...defaultProps} />);

    // No status summary should be rendered
    expect(screen.queryByText(/状态：/)).not.toBeInTheDocument();
  });

  it("renders status summary when statuses are active", () => {
    render(<LedgerEntriesToolbar {...defaultProps} filters={{ statuses: ["completed"] }} />);

    // Status summary should appear
    expect(screen.getByText(/状态：/)).toBeDefined();
  });

  it("renders preset name in summary when statuses match a known preset", () => {
    render(
      <LedgerEntriesToolbar
        {...defaultProps}
        filters={{ statuses: ["candidate_pending", "anomaly", "failed"] }}
      />
    );

    // Should show the "Needs Attention" preset label
    expect(screen.getByText(/待处理/)).toBeDefined();
  });

  it("calls onFiltersChange with empty statuses when clear button is clicked", async () => {
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();

    render(
      <LedgerEntriesToolbar
        {...defaultProps}
        filters={{ statuses: ["completed"] }}
        onFiltersChange={onFiltersChange}
      />
    );

    // Click the clear (X) button
    const clearButton = screen.getByRole("button", { name: "全部状态" });
    await user.click(clearButton);

    expect(onFiltersChange).toHaveBeenCalledWith({ statuses: [] });
  });

  it("passes onApplyPreset to EntryFilterPanel", () => {
    const onApplyPreset = vi.fn();

    render(<LedgerEntriesToolbar {...defaultProps} onApplyPreset={onApplyPreset} />);

    // EntryFilterPanel is rendered (check for more filters button)
    expect(screen.getByText("更多筛选")).toBeDefined();
  });

  it("does not render EntryFilterPanel in selection mode", () => {
    render(<LedgerEntriesToolbar {...defaultProps} isSelectionMode={true} selectedCount={1} />);

    // EntryFilterPanel should not be rendered in selection mode
    expect(screen.queryByText("更多筛选")).not.toBeInTheDocument();
  });
});
