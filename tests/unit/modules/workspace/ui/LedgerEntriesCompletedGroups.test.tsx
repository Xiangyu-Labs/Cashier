import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { LedgerEntriesUnifiedGroups } from "@/modules/workspace/ui/LedgerEntriesCompletedGroups";

const cardProps = vi.fn();
vi.mock("@/modules/source-document/ui", () => ({
  SourceDocumentCard: (props: unknown) => {
    cardProps(props);
    return <div>Source document</div>;
  },
}));

describe("LedgerEntriesUnifiedGroups", () => {
  it("renders stream groups correctly", () => {
    cardProps.mockClear();
    const group: UnifiedStreamGroup = {
      date: "2026-07-15",
      dateProvenance: "transaction",
      total: "12",
      unconvertedCount: 0,
      currencyTotals: {},
      items: [
        {
          sourceDocument: {
            id: "document-1",
            ledgerId: "ledger-1",
            status: "completed",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          ledgerEntries: [],
          effectiveDate: "2026-07-15",
          dateProvenance: "transaction",
        },
      ],
    };

    render(
      <LedgerEntriesUnifiedGroups
        streamGroups={[group]}
        mainCurrency="CNY"
        onViewSourceDetail={vi.fn()}
        onDeleteSourceConfirm={vi.fn()}
        isSelectionMode={false}
        selectedIds={[]}
        onToggleSelection={vi.fn()}
        noRecordsText="No records"
        getItemProps={() => ({})}
      />
    );

    expect(screen.getByText("Source document")).toBeInTheDocument();
    expect(cardProps).toHaveBeenCalledWith(expect.objectContaining({ defaultExpanded: true }));
  });

  it("passes the ledger collapse preference to cards", () => {
    const group = {
      date: "2026-07-15",
      dateProvenance: "transaction" as const,
      total: "0",
      unconvertedCount: 0,
      currencyTotals: {},
      items: [
        {
          sourceDocument: { id: "document-1", status: "completed" },
          ledgerEntries: [],
          effectiveDate: "2026-07-15",
          dateProvenance: "transaction" as const,
        },
      ],
    } as unknown as UnifiedStreamGroup;
    cardProps.mockClear();
    render(
      <LedgerEntriesUnifiedGroups
        streamGroups={[group]}
        mainCurrency="CNY"
        onViewSourceDetail={vi.fn()}
        onDeleteSourceConfirm={vi.fn()}
        isSelectionMode={false}
        selectedIds={[]}
        onToggleSelection={vi.fn()}
        noRecordsText="No records"
        getItemProps={() => ({})}
        collapseEntriesDefault
      />
    );
    expect(cardProps).toHaveBeenCalledWith(expect.objectContaining({ defaultExpanded: false }));
  });

  it("only rerenders the stream row whose selected state changed", () => {
    const firstItem = {
      sourceDocument: { id: "document-1", ledgerId: "ledger-1", status: "completed" },
      ledgerEntries: [],
      effectiveDate: "2026-07-15",
      dateProvenance: "transaction" as const,
    };
    const secondItem = {
      sourceDocument: { id: "document-2", ledgerId: "ledger-1", status: "completed" },
      ledgerEntries: [],
      effectiveDate: "2026-07-15",
      dateProvenance: "transaction" as const,
    };
    const groups = [
      {
        date: "2026-07-15",
        dateProvenance: "transaction" as const,
        total: "0",
        unconvertedCount: 0,
        currencyTotals: {},
        items: [firstItem, secondItem],
      },
    ] as unknown as UnifiedStreamGroup[];
    const onViewSourceDetail = vi.fn();
    const onDeleteSourceConfirm = vi.fn();
    const onToggleSelection = vi.fn();
    const getItemProps = () => ({});
    cardProps.mockClear();

    const { rerender } = render(
      <LedgerEntriesUnifiedGroups
        streamGroups={groups}
        mainCurrency="CNY"
        onViewSourceDetail={onViewSourceDetail}
        onDeleteSourceConfirm={onDeleteSourceConfirm}
        isSelectionMode
        selectedIds={[]}
        onToggleSelection={onToggleSelection}
        noRecordsText="No records"
        getItemProps={getItemProps}
      />
    );
    expect(cardProps).toHaveBeenCalledTimes(2);

    rerender(
      <LedgerEntriesUnifiedGroups
        streamGroups={groups}
        mainCurrency="CNY"
        onViewSourceDetail={onViewSourceDetail}
        onDeleteSourceConfirm={onDeleteSourceConfirm}
        isSelectionMode
        selectedIds={["document-1"]}
        onToggleSelection={onToggleSelection}
        noRecordsText="No records"
        getItemProps={getItemProps}
      />
    );

    expect(cardProps).toHaveBeenCalledTimes(3);
    expect(cardProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceDocument: firstItem.sourceDocument,
        isSelected: true,
      })
    );
  });
});
