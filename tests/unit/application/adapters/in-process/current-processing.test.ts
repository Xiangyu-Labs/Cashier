import { describe, expect, it, vi } from "vitest";
import { createExecuteSingleProcessingJob } from "@/application/adapters/in-process/current-processing";
import type { RevisionProcessingResultContract } from "@/application/contracts/processing";
import { ProcessingCancelledError } from "@/modules/source-document/application/parse-source-document/contracts";

const job = {
  id: "job",
  sourceDocumentId: "document",
  revisionId: "revision",
  requestedAt: "2026-09-01T00:00:00Z",
  attemptNumber: 1,
};

function fixture() {
  const complete = vi.fn().mockResolvedValue(true);
  const process = vi.fn();
  const recordProcessingFailure = vi.fn().mockResolvedValue(true);
  const execute = createExecuteSingleProcessingJob({
    createProcessingJobAdapter: () => ({
      claim: vi.fn().mockResolvedValue({ job, ledgerId: "ledger", claimToken: "token" }),
      renew: vi.fn().mockResolvedValue(null),
      complete,
    }),
    createRevisionProcessor: () => ({ process }),
    recordProcessingFailure,
  });
  return { execute, complete, process, recordProcessingFailure };
}

describe("single processing job completion", () => {
  it.each(["completed", "failed"] as const)(
    "does not complete an atomic %s twice",
    async (processingStatus) => {
      const f = fixture();
      f.process.mockResolvedValue({
        processingStatus,
        completion: "atomic",
      } satisfies RevisionProcessingResultContract);
      await expect(f.execute(job)).resolves.toBe(true);
      expect(f.complete).not.toHaveBeenCalled();
      expect(f.recordProcessingFailure).not.toHaveBeenCalled();
    }
  );

  it("completes a residual job with its claim token", async () => {
    const f = fixture();
    f.process.mockResolvedValue({ processingStatus: "completed", completion: "residual" });
    await f.execute(job);
    expect(f.complete).toHaveBeenCalledExactlyOnceWith({
      jobId: "job",
      claimToken: "token",
      processingStatus: "completed",
    });
  });

  it("preserves an error atomically without another completion", async () => {
    const f = fixture();
    f.process.mockRejectedValue(new Error("failed"));
    await f.execute(job);
    expect(f.recordProcessingFailure).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        failureKind: "processing_error",
        lease: { jobId: "job", claimToken: "token" },
      })
    );
    expect(f.complete).not.toHaveBeenCalled();
  });

  it("leaves a cancelled claim untouched", async () => {
    const f = fixture();
    f.process.mockRejectedValue(new ProcessingCancelledError());
    await f.execute(job);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.recordProcessingFailure).not.toHaveBeenCalled();
  });
});
