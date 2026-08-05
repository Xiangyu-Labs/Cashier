import { describe, expect, it, vi } from "vitest";
import { batchResolveDuplicateReviews } from "@/modules/source-document/application/use-cases/resolve-duplicate-review";

describe("batchResolveDuplicateReviews", () => {
  it("only resolves pending duplicates and preserves ordinary selections as skipped", async () => {
    const listPendingDuplicateReviews = vi
      .fn()
      .mockResolvedValue([{ sourceDocumentId: "duplicate-1", revisionId: "revision-1" }]);
    const keepDuplicate = vi.fn().mockResolvedValue(true);
    const lifecycle = {
      keepDuplicate,
      discardDuplicate: vi.fn(),
    };

    const result = await batchResolveDuplicateReviews(
      {
        ledgerId: "ledger-1",
        sourceDocumentIds: ["duplicate-1", "ordinary-1", "duplicate-1"],
        decision: "keep",
      },
      { reviews: { listPendingDuplicateReviews }, lifecycle }
    );

    expect(listPendingDuplicateReviews).toHaveBeenCalledWith("ledger-1", [
      "duplicate-1",
      "ordinary-1",
    ]);
    expect(keepDuplicate).toHaveBeenCalledWith("ledger-1", "duplicate-1", "revision-1");
    expect(lifecycle.discardDuplicate).not.toHaveBeenCalled();
    expect(result).toEqual({
      requestedCount: 2,
      succeededIds: ["duplicate-1"],
      skipped: [{ id: "ordinary-1", reason: "not_duplicate_pending" }],
      failed: [],
    });
  });

  it("reports races as skipped and unexpected lifecycle errors as failed", async () => {
    const listPendingDuplicateReviews = vi.fn().mockResolvedValue([
      { sourceDocumentId: "duplicate-1", revisionId: "revision-1" },
      { sourceDocumentId: "duplicate-2", revisionId: "revision-2" },
      { sourceDocumentId: "duplicate-3", revisionId: "revision-3" },
    ]);
    const discardDuplicate = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("database unavailable"));

    const result = await batchResolveDuplicateReviews(
      {
        ledgerId: "ledger-2",
        sourceDocumentIds: ["duplicate-1", "duplicate-2", "duplicate-3"],
        decision: "discard",
      },
      {
        reviews: { listPendingDuplicateReviews },
        lifecycle: { keepDuplicate: vi.fn(), discardDuplicate },
      }
    );

    expect(discardDuplicate).toHaveBeenNthCalledWith(1, "ledger-2", "duplicate-1", "revision-1");
    expect(result).toEqual({
      requestedCount: 3,
      succeededIds: ["duplicate-1"],
      skipped: [{ id: "duplicate-2", reason: "already_processed" }],
      failed: [{ id: "duplicate-3", reason: "database unavailable" }],
    });
  });
});
