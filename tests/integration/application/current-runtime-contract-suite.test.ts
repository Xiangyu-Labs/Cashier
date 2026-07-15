import { applicationContractSuite } from "../../helpers/application-contract-suites";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";
import { supportedSourceDocumentActions } from "@/application/contracts";
import type {
  ProcessingCompletionContract,
  ProcessingIntentContract,
  UploadPlanContract,
} from "@/application/contracts";
import { LocalStoredFileAdapter } from "@/application/adapters/local";
import {
  SqliteProcessingIntentAdapter,
  sqliteIdempotencyAdapter,
  sqliteRevisionAdapter,
} from "@/application/adapters/sqlite";

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

applicationContractSuite("real SQLite/local-file/in-process adapter composition", () => {
  const db = getTestDb();
  const setup = createTestUserWithLedger(db);
  const files = new LocalStoredFileAdapter(new ContractFileStore());
  const processing = new SqliteProcessingIntentAdapter();
  const actualIntents = new Map<string, ProcessingIntentContract>();
  const completions: ProcessingCompletionContract[] = [];

  async function prepareIntent(intent: ProcessingIntentContract): Promise<ProcessingIntentContract> {
    const existing = actualIntents.get(intent.id);
    if (existing != null) return existing;
    const { ledgerId } = await setup;
    const pending = await sqliteRevisionAdapter.createPending({
      ledgerId,
      submittedText: "contract processing input",
    });
    const actual = {
      ...intent,
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
    claim: (intentId: string) => processing.claim(intentId),
    async complete(result: ProcessingCompletionContract) {
      const completed = await processing.complete(result);
      if (completed) completions.push(result);
      return completed;
    },
  };

  async function plan(): Promise<UploadPlanContract> {
    const { ledgerId } = await setup;
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
    executeIdempotently: (key, operation) => sqliteIdempotencyAdapter.execute(key, operation),
    files,
    processing: processingPort,
    plan,
    async finalize(current) {
      const { ledgerId } = await setup;
      const finalized = await files.finalizeUpload({
        ownerLedgerId: ledgerId,
        uploadSessionId: current.id,
        finalizationToken: current.finalizationToken,
        targetIds: [current.targets[0]!.id],
      });
      await sqliteRevisionAdapter.createPending({
        ledgerId,
        storedFileIds: finalized.map((file) => file.id),
      });
      return finalized;
    },
    async read(file) {
      const { ledgerId } = await setup;
      return files.readAuthorized(ledgerId, file.id);
    },
    dispatch: (intent) => processingPort.dispatch(intent),
    completions: () => completions,
  };
});
