import { describe, expect, it } from "vitest";
import type {
  AuthorizedFileReadContract,
  ProcessingCompletionContract,
  ProcessingIntentContract,
  ProcessingPort,
  StoredFileContract,
  StoredFilePort,
  UploadPlanContract,
} from "@/application/contracts";

export interface ApplicationContractHarness {
  sourceDocumentActions(input: {
    activeRevisionId: string | null;
    pendingOutcome: "failed" | "processing";
  }): readonly string[];
  executeIdempotently<T>(key: string, operation: () => Promise<T>): Promise<T>;
  files: StoredFilePort;
  processing: ProcessingPort;
  plan(): Promise<UploadPlanContract>;
  finalize(plan: UploadPlanContract): Promise<readonly StoredFileContract[]>;
  read(file: StoredFileContract): Promise<AuthorizedFileReadContract | null>;
  dispatch(intent: ProcessingIntentContract): Promise<void>;
  completions(): readonly ProcessingCompletionContract[];
}

/** Run this suite for every current and future adapter composition. */
export function applicationContractSuite(
  name: string,
  create: () => ApplicationContractHarness | Promise<ApplicationContractHarness>
): void {
  describe(name, () => {
    it("preserves active revisions and only exposes actions for a terminal pending revision", async () => {
      const harness = await create();
      expect(
        harness.sourceDocumentActions({ activeRevisionId: "revision-1", pendingOutcome: "failed" })
      ).toContain("retry");
      expect(
        harness.sourceDocumentActions({
          activeRevisionId: "revision-1",
          pendingOutcome: "processing",
        })
      ).toEqual(["retry", "edit_retry", "delete"]);
    });

    it("enforces idempotency", async () => {
      const harness = await create();
      let calls = 0;
      const operation = async () => ({ value: ++calls });
      await expect(harness.executeIdempotently("same-request", operation)).resolves.toEqual({
        value: 1,
      });
      await expect(harness.executeIdempotently("same-request", operation)).resolves.toEqual({
        value: 1,
      });
      expect(calls).toBe(1);
    });

    it("finalizes an upload into opaque stored-file identities and authorizes reads", async () => {
      const harness = await create();
      const plan = await harness.plan();
      const files = await harness.finalize(plan);
      expect(files).toHaveLength(1);
      expect(files[0]?.id).not.toContain("/");
      await expect(harness.read(files[0]!)).resolves.toMatchObject({ file: files[0] });
    });

    it("does not reveal a file when authorization is denied", async () => {
      const harness = await create();
      const files = await harness.finalize(await harness.plan());
      await expect(harness.files.readAuthorized("other-ledger", files[0]!.id)).resolves.toBeNull();
    });

    it("makes duplicate processing dispatch and recovery completion harmless", async () => {
      const harness = await create();
      const intent: ProcessingIntentContract = {
        id: "intent-1",
        sourceDocumentId: "document-1",
        revisionId: "revision-1",
        requestedAt: "2026-07-13T00:00:00.000Z",
        attempt: 1,
      };
      await harness.dispatch(intent);
      await harness.dispatch(intent);
      const claim = await harness.processing.claim(intent.id);
      expect(claim).not.toBeNull();
      await harness.processing.complete({
        intentId: intent.id,
        claimToken: claim!.claimToken,
        outcome: "completed",
      });
      await harness.processing.complete({
        intentId: intent.id,
        claimToken: claim!.claimToken,
        outcome: "completed",
      });
      expect(harness.completions()).toHaveLength(1);
    });
  });
}
