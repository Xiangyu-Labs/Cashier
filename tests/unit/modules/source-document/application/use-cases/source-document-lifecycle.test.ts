import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/errors";
import type { SourceDocumentLifecyclePort } from "@/modules/source-document/application/ports";
import { abandonSourceDocumentCandidate } from "@/modules/source-document/application/use-cases/source-document-lifecycle";

function lifecycle(abandonCandidate: SourceDocumentLifecyclePort["abandonCandidate"]) {
  return {
    acceptCandidate: vi.fn(),
    abandonCandidate,
    keepDuplicate: vi.fn(),
    discardDuplicate: vi.fn(),
    cancelPending: vi.fn(),
  } satisfies SourceDocumentLifecyclePort;
}

describe("abandonSourceDocumentCandidate", () => {
  it("rejects a lifecycle result that did not abandon the candidate", async () => {
    await expect(
      abandonSourceDocumentCandidate(
        {
          ledgerId: "ledger-1",
          sourceDocumentId: "document-1",
          expectedVersion: 1,
        },
        lifecycle(vi.fn(async () => null))
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
