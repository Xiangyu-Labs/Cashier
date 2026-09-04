import { describe, expect, it, vi } from "vitest";
import { batchResolveDuplicateReviews } from "@/modules/source-document/application/use-cases/resolve-duplicate-review";
import { StaleSourceDocumentVersionError } from "@/lib/errors";

describe("batchResolveDuplicateReviews", () => {
  it("only resolves pending duplicates and preserves ordinary selections as skipped", async () => {
    const keepDuplicate = vi.fn().mockResolvedValue({ version: 4, status: "completed" });
    const lifecycle = {
      keepDuplicate,
      discardDuplicate: vi.fn(),
    };

    const result = await batchResolveDuplicateReviews(
      {
        ledgerId: "ledger-1",
        targets: [
          { sourceDocumentId: "duplicate-1", expectedVersion: 3 },
          { sourceDocumentId: "ordinary-1", expectedVersion: 1 },
        ],
        decision: "keep",
      },
      lifecycle
    );

    expect(keepDuplicate).toHaveBeenCalledWith("ledger-1", "duplicate-1", 3);
    expect(lifecycle.discardDuplicate).not.toHaveBeenCalled();
    expect(result).toEqual({
      succeeded: [
        { id: "duplicate-1", sourceDocumentId: "duplicate-1", version: 4 },
        { id: "ordinary-1", sourceDocumentId: "ordinary-1", version: 4 },
      ],
      stale: [],
      failed: [],
    });
  });

  it("reports races as skipped and unexpected lifecycle errors as failed", async () => {
    const discardDuplicate = vi
      .fn()
      .mockResolvedValueOnce({ version: 2, status: "deleted" })
      .mockRejectedValueOnce(new StaleSourceDocumentVersionError("duplicate-2", 1, 2))
      .mockRejectedValueOnce(new Error("database unavailable"));

    const result = await batchResolveDuplicateReviews(
      {
        ledgerId: "ledger-2",
        targets: ["duplicate-1", "duplicate-2", "duplicate-3"].map((sourceDocumentId) => ({
          sourceDocumentId,
          expectedVersion: 1,
        })),
        decision: "discard",
      },
      { keepDuplicate: vi.fn(), discardDuplicate }
    );

    expect(discardDuplicate).toHaveBeenNthCalledWith(1, "ledger-2", "duplicate-1", 1);
    expect(result).toEqual({
      succeeded: [{ id: "duplicate-1", sourceDocumentId: "duplicate-1", version: 2 }],
      stale: [
        {
          id: "duplicate-2",
          sourceDocumentId: "duplicate-2",
          expectedVersion: 1,
          currentVersion: 2,
        },
      ],
      failed: [{ id: "duplicate-3", code: "INTERNAL" }],
    });
  });
});
