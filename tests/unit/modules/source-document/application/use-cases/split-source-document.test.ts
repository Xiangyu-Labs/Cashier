import { beforeEach, describe, expect, it, vi } from "vitest";
import { splitSourceDocument } from "@/modules/source-document/application/use-cases/split-source-document";

const get = vi.fn();
const split = vi.fn();
const input = {
  sourceDocumentId: crypto.randomUUID(),
  expectedRevisionId: crypto.randomUUID(),
  operationId: crypto.randomUUID(),
  newSourceDocumentId: crypto.randomUUID(),
  ledgerEntryIds: [crypto.randomUUID()],
  entryDate: "2026-08-16",
};

describe("splitSourceDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates only when the current document supports splitting", async () => {
    get.mockResolvedValue({ supportedActions: ["split_entries"] });
    split.mockResolvedValue({ movedEntryCount: 1 });

    await expect(
      splitSourceDocument("ledger-1", input, {
        documents: { get },
        updates: { split },
      })
    ).resolves.toEqual({ movedEntryCount: 1 });
    expect(get).toHaveBeenCalledWith("ledger-1", input.sourceDocumentId);
    expect(split).toHaveBeenCalledWith({ ledgerId: "ledger-1", ...input });
  });

  it("rejects missing and unsupported documents without mutating", async () => {
    get.mockResolvedValueOnce(null).mockResolvedValueOnce({ supportedActions: ["delete"] });
    await expect(
      splitSourceDocument("ledger-1", input, { documents: { get }, updates: { split } })
    ).rejects.toThrow(/source document/i);
    await expect(
      splitSourceDocument("ledger-1", input, { documents: { get }, updates: { split } })
    ).rejects.toThrow(/current state/i);
    expect(split).not.toHaveBeenCalled();
  });
});
