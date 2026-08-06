import { applicationContractSuite } from "../../helpers/application-contract-suites";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";
import { supportedSourceDocumentActions } from "@/application/contracts";
import type {
  ProcessingCompletionContract,
  ProcessingIntentContract,
  UploadPlanContract,
} from "@/application/contracts";
import { StoredFileAdapter } from "@/application/adapters/storage";
import {
  PostgresProcessingIntentAdapter,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres";

class ContractFileStore {
  readonly files = new Map<string, Buffer>();

  async upload(key: string, data: Buffer): Promise<string> {
    this.files.set(key, Buffer.from(data));
    return `/api/uploads/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (file == null) throw new Error("missing contract file");
    return Buffer.from(file);
  }

  async delete(key: string): Promise<{ success: boolean }> {
    this.files.delete(key);
    return { success: true };
  }
}

applicationContractSuite("real Postgres/object-storage/in-process adapter composition", () => {
  const db = getTestDb();
  const files = new StoredFileAdapter(new ContractFileStore());
  const processing = new PostgresProcessingIntentAdapter();
  const actualIntents = new Map<string, ProcessingIntentContract>();
  const completions: ProcessingCompletionContract[] = [];
  let setupPromise: ReturnType<typeof createTestUserWithLedger> | null = null;

  function getSetup(): ReturnType<typeof createTestUserWithLedger> {
    if (setupPromise == null) {
      setupPromise = createTestUserWithLedger(db);
    }
    return setupPromise;
  }

  async function prepareIntent(
    intent: ProcessingIntentContract
  ): Promise<ProcessingIntentContract> {
    const existing = actualIntents.get(intent.id);
    if (existing != null) return existing;
    const { ledgerId } = await getSetup();
    const pending = await postgresRevisionAdapter.createPending({
      ledgerId,
      submittedText: "contract processing input",
    });
    const actual = {
      ...intent,
      id: crypto.randomUUID(),
      sourceDocumentId: pending.document.id,
      revisionId: pending.revision.id,
    };
    actualIntents.set(intent.id, actual);
    return actual;
  }

  const processingPort = {
    async dispatch(intent: ProcessingIntentContract) {
      await processing.dispatch(await prepareIntent(intent));
    },
    claim: (intentId: string) => processing.claim(actualIntents.get(intentId)?.id ?? intentId),
    renew: (intentId: string, claimToken: string) =>
      processing.renew(actualIntents.get(intentId)?.id ?? intentId, claimToken),
    async complete(result: ProcessingCompletionContract) {
      const completed = await processing.complete({
        ...result,
        intentId: actualIntents.get(result.intentId)?.id ?? result.intentId,
      });
      if (completed) completions.push(result);
      return completed;
    },
  };

  async function plan(): Promise<UploadPlanContract> {
    const { ledgerId } = await getSetup();
    const bytes = Buffer.from("contract-file");
    const current = await files.createUploadPlan(ledgerId, [
      {
        contentType: "image/jpeg",
        byteSize: bytes.length,
        originalFilename: "contract.jpg",
      },
    ]);
    await files.uploadTarget({
      ledgerId,
      uploadSessionId: current.id,
      targetId: current.targets[0]!.id,
      contentType: "image/jpeg",
      body: bytes,
    });
    return current;
  }

  return {
    sourceDocumentActions: supportedSourceDocumentActions,
    files,
    processing: processingPort,
    plan,
    async finalize(current) {
      const { ledgerId } = await getSetup();
      const finalized = await files.finalizeUpload({
        ownerLedgerId: ledgerId,
        uploadSessionId: current.id,
        finalizationToken: current.finalizationToken,
        targetIds: [current.targets[0]!.id],
      });
      await postgresRevisionAdapter.createPending({
        ledgerId,
        storedFileIds: finalized.map((file) => file.id),
      });
      return finalized;
    },
    async read(file) {
      const { ledgerId } = await getSetup();
      return files.readAuthorized(ledgerId, file.id);
    },
    dispatch: (intent) => processingPort.dispatch(intent),
    completions: () => completions,
  };
});
