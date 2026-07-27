import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { LedgerEntriesUnifiedGroups } from "@/modules/workspace/ui/LedgerEntriesCompletedGroups";

vi.mock("@/modules/source-document/ui", () => ({
  SourceDocumentCard: () => <div>Source document</div>,
}));

describe("LedgerEntriesUnifiedGroups", () => {
  it("renders stream groups correctly", () => {
    const group: UnifiedStreamGroup = {
      date: "2026-07-15",
      dateProvenance: "transaction",
      total: 12,
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
        onViewLedgerEntry={vi.fn()}
        onViewSourceDetail={vi.fn()}
        onDeleteSourceConfirm={vi.fn()}
        isSelectionMode={false}
        selectedIds={[]}
        onToggleSelection={vi.fn()}
        collapseEntriesDefault={false}
        noRecordsText="No records"
        getItemProps={() => ({})}
      />
    );

    expect(screen.getByText("Source document")).toBeInTheDocument();
  });
});
