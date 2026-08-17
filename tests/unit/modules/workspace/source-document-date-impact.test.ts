import { beforeEach, describe, expect, it, vi } from "vitest";

const ledgerActions = vi.hoisted(() => ({
  previewBatchLedgerEntryDateAction: vi.fn(),
}));

vi.mock("@/modules/ledger/actions", () => ledgerActions);

import { previewSourceDocumentDateImpact } from "@/modules/workspace/source-document-date-impact";

describe("previewSourceDocumentDateImpact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid preview for selected documents without ledger entries", async () => {
    await expect(previewSourceDocumentDateImpact("ledger-1", ["document-1"], [])).resolves.toEqual({
      selectedEntryCount: 0,
      sourceDocumentCount: 1,
      affectedEntryCount: 0,
      sourceDocumentIds: ["document-1"],
    });
    expect(ledgerActions.previewBatchLedgerEntryDateAction).not.toHaveBeenCalled();
  });

  it("includes entry-less documents in a mixed selection preview", async () => {
    ledgerActions.previewBatchLedgerEntryDateAction.mockResolvedValue({
      selectedEntryCount: 1,
      sourceDocumentCount: 1,
      affectedEntryCount: 2,
      sourceDocumentIds: ["document-1"],
    });

    await expect(
      previewSourceDocumentDateImpact("ledger-1", ["document-1", "document-2"], ["entry-1"])
    ).resolves.toEqual({
      selectedEntryCount: 1,
      sourceDocumentCount: 2,
      affectedEntryCount: 2,
      sourceDocumentIds: ["document-1", "document-2"],
    });
    expect(ledgerActions.previewBatchLedgerEntryDateAction).toHaveBeenCalledWith("ledger-1", [
      "entry-1",
    ]);
  });
});
