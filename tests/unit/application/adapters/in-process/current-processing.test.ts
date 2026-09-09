import { describe, expect, it, vi } from "vitest";
import { createExecuteSingleProcessingIntent } from "@/application/adapters/in-process/current-processing";
import type { RevisionProcessingResultContract } from "@/application/contracts/processing";
import { ProcessingCancelledError } from "@/modules/source-document/application/parse-source-document/contracts";

const intent = {
  id: "intent",
  sourceDocumentId: "document",
  revisionId: "revision",
  requestedAt: "2026-09-01T00:00:00Z",
  attempt: 1,
};

function fixture() {
  const complete = vi.fn().mockResolvedValue(true);
  const process = vi.fn();
  const preserveTerminalOutcome = vi.fn().mockResolvedValue(true);
  const execute = createExecuteSingleProcessingIntent({
    createIntentAdapter: () => ({
      claim: vi.fn().mockResolvedValue({ intent, ledgerId: "ledger", claimToken: "token" }),
      renew: vi.fn().mockResolvedValue(null),
      complete,
    }),
    createRevisionProcessor: () => ({ process }),
    preserveTerminalOutcome,
  });
  return { execute, complete, process, preserveTerminalOutcome };
}

describe("single processing intent completion", () => {
  it.each(["completed", "invalid"] as const)(
    "does not complete an atomic %s twice",
    async (outcome) => {
      const f = fixture();
      f.process.mockResolvedValue({
        outcome,
        completion: "atomic",
      } satisfies RevisionProcessingResultContract);
      await expect(f.execute(intent)).resolves.toBe(true);
      expect(f.complete).not.toHaveBeenCalled();
      expect(f.preserveTerminalOutcome).not.toHaveBeenCalled();
    }
  );

  it("completes a residual intent with its claim token", async () => {
    const f = fixture();
    f.process.mockResolvedValue({ outcome: "completed", completion: "residual" });
    await f.execute(intent);
    expect(f.complete).toHaveBeenCalledExactlyOnceWith({
      intentId: "intent",
      claimToken: "token",
      outcome: "completed",
    });
  });

  it("preserves an error atomically without another completion", async () => {
    const f = fixture();
    f.process.mockRejectedValue(new Error("failed"));
    await f.execute(intent);
    expect(f.preserveTerminalOutcome).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        outcome: "failed",
        lease: { intentId: "intent", claimToken: "token" },
      })
    );
    expect(f.complete).not.toHaveBeenCalled();
  });

  it("leaves a cancelled claim untouched", async () => {
    const f = fixture();
    f.process.mockRejectedValue(new ProcessingCancelledError());
    await f.execute(intent);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.preserveTerminalOutcome).not.toHaveBeenCalled();
  });
});
