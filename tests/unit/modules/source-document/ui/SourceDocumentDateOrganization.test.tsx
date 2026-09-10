import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
import { SourceDocumentDateOrganization } from "@/modules/source-document/ui/SourceDocumentDateOrganization";

const entry: LedgerEntryEmbeddedViewDto = {
  id: "33333333-3333-4333-8333-333333333333",
  ledgerId: "11111111-1111-4111-8111-111111111111",
  categoryId: null,
  sourceDocumentId: "22222222-2222-4222-8222-222222222222",
  amount: "18.00",
  currency: "CNY",
  itemName: "早餐",
  description: null,
  convertedAmount: "18.00",
  exchangeRate: "1",
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
  deletedAt: null,
};

describe("SourceDocumentDateOrganization", () => {
  it("keeps an adjusted date after finishing the draft and applies it", async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentDateOrganization
        suggestion={{
          schemaVersion: 1,
          id: "44444444-4444-4444-8444-444444444444",
          referenceDate: "2026-09-10",
          sourceDocumentDate: "2026-09-10",
          items: [
            {
              ledgerEntryId: entry.id,
              dateHint: { kind: "relative", value: "yesterday", sourceText: "昨天" },
              resolvedDate: "2026-09-09",
              sourceText: "昨天",
              snapshot: { itemName: entry.itemName, amount: entry.amount, currency: "CNY" },
            },
          ],
        }}
        entries={[entry]}
        disabled={false}
        onApply={onApply}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "调整" }));
    fireEvent.change(screen.getByLabelText("早餐 的建议日期"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成调整" }));
    expect(screen.getByText(/移至 2026-09-08/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部应用" }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        suggestionId: "44444444-4444-4444-8444-444444444444",
        groups: [
          {
            id: "2026-09-08",
            entryDate: "2026-09-08",
            ledgerEntryIds: [entry.id],
          },
        ],
        appliedGroupIds: ["2026-09-08"],
      })
    );
  });
});
