import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  getBatchEntryDateImpact: vi.fn(),
}));

import { previewSourceDocumentDateImpact } from "@/modules/workspace/application/use-cases/preview-source-document-date-impact";

describe("previewSourceDocumentDateImpact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid preview for selected documents without ledger entries", async () => {
    await expect(
      previewSourceDocumentDateImpact(
        { ledgerId: "ledger-1", sourceDocumentIds: ["document-1"], ledgerEntryIds: [] },
        reads
      )
    ).resolves.toEqual({
      selectedEntryCount: 0,
      sourceDocumentCount: 1,
      affectedEntryCount: 0,
      sourceDocumentIds: ["document-1"],
    });
    expect(reads.getBatchEntryDateImpact).not.toHaveBeenCalled();
  });

  it("includes entry-less documents in a mixed selection preview", async () => {
    reads.getBatchEntryDateImpact.mockResolvedValue({
      selectedEntryCount: 1,
      sourceDocumentCount: 1,
      affectedEntryCount: 2,
      sourceDocumentIds: ["document-1"],
    });

    await expect(
      previewSourceDocumentDateImpact(
        {
          ledgerId: "ledger-1",
          sourceDocumentIds: ["document-1", "document-2"],
          ledgerEntryIds: ["entry-1"],
        },
        reads
      )
    ).resolves.toEqual({
      selectedEntryCount: 1,
      sourceDocumentCount: 2,
      affectedEntryCount: 2,
      sourceDocumentIds: ["document-1", "document-2"],
    });
    expect(reads.getBatchEntryDateImpact).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      ledgerEntryIds: ["entry-1"],
    });
  });
});
