import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SourceDocumentGroupDto } from "@/modules/source-document/contracts";
import { LedgerEntriesCompletedGroups } from "@/modules/workspace/ui/LedgerEntriesCompletedGroups";

vi.mock("@/modules/source-document/ui", () => ({
  SourceDocumentCard: () => <div>Source document</div>,
}));

describe("LedgerEntriesCompletedGroups", () => {
  it("leaves pagination messaging to the parent", () => {
    const group = {
      sourceDocument: {
        id: "document-1",
        ledgerId: "ledger-1",
        status: "completed",
      },
      ledgerEntries: [],
    } as unknown as SourceDocumentGroupDto;

    render(
      <LedgerEntriesCompletedGroups
        groupedCompletedByDate={[{ title: "Today", total: 12, items: [group] }]}
        mainCurrency="CNY"
        onViewLedgerEntry={vi.fn()}
        onViewSourceDetail={vi.fn()}
        onRetry={vi.fn()}
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
    expect(screen.queryByText(/no more items/i)).not.toBeInTheDocument();
  });
});
