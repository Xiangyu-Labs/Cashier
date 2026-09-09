import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PeriodParams } from "@/lib/period-utils";
import { LedgerEntriesToolbar } from "@/modules/workspace/ui/LedgerEntriesToolbar";

const defaultPeriodParams: PeriodParams = { period: "thisMonth" };

const defaultProps = {
  isSelectionMode: false,
  isAllSelected: false,
  selectedCount: 0,
  queryFingerprint: "query-1",
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
  it("shows the unfiltered total with its label", () => {
    render(<LedgerEntriesToolbar {...defaultProps} />);

    expect(screen.getByText("Total ¥123.45")).toBeInTheDocument();
  });

  it("shows selection controls instead of totals and filters while selecting", () => {
    render(<LedgerEntriesToolbar {...defaultProps} isSelectionMode={true} selectedCount={3} />);

    expect(screen.getByText(/已选择 3 项/)).toBeInTheDocument();
    expect(screen.getByTitle("取消")).toBeInTheDocument();
    expect(screen.queryByText("Total ¥123.45")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "筛选" })).not.toBeInTheDocument();
  });

  it("keeps active status details inside the filter panel", () => {
    render(<LedgerEntriesToolbar {...defaultProps} filters={{ statuses: ["completed"] }} />);

    expect(screen.queryByText(/状态：/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "筛选 1" })).toBeDefined();
  });

  it("renders only the amount when a filtered result omits the prefix", () => {
    const { totalPrefix: _totalPrefix, ...filteredProps } = defaultProps;
    render(<LedgerEntriesToolbar {...filteredProps} />);

    expect(screen.getByText("¥123.45")).toBeInTheDocument();
    expect(screen.queryByText(/Filtered total/i)).not.toBeInTheDocument();
  });

  it("blocks date confirmation when the selection query changes after preview", async () => {
    const onUpdateDates = vi.fn();
    const onPreviewDateImpact = vi.fn().mockResolvedValue({
      selectedEntryCount: 1,
      sourceDocumentCount: 1,
      affectedEntryCount: 1,
    });
    const { rerender } = render(
      <LedgerEntriesToolbar
        {...defaultProps}
        isSelectionMode
        selectedCount={1}
        selectedSourceDocumentIds={["document-1"]}
        selectedEntryIds={["entry-1"]}
        onUpdateDates={onUpdateDates}
        onPreviewDateImpact={onPreviewDateImpact}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "修改日期" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认" }));
    await waitFor(() => expect(onPreviewDateImpact).toHaveBeenCalledOnce());

    rerender(
      <LedgerEntriesToolbar
        {...defaultProps}
        queryFingerprint="query-2"
        isSelectionMode
        selectedCount={1}
        selectedSourceDocumentIds={["document-1"]}
        selectedEntryIds={["entry-1"]}
        onUpdateDates={onUpdateDates}
        onPreviewDateImpact={onPreviewDateImpact}
      />
    );

    expect(screen.getByText("所选项目已变化，请重新预览日期影响。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(onUpdateDates).not.toHaveBeenCalled();
  });
});
