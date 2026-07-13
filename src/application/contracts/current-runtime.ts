import crypto from "crypto";
import type {
  LedgerId,
  ProcessingIntentContract,
  ProcessingPort,
  StoredFileContract,
  StoredFileId,
  TrustedFileMetadata,
} from ".";
import { getLocalStorage } from "@/lib/storage/local";
import { submitTask } from "@/lib/tasks";

export interface LocalStoredFileReceipt {
  file: StoredFileContract;
  /** Private adapter-only compatibility projection for the current image_urls column. */
  legacyReadUrl: string;
}

function opaqueLocalFileId(key: string): StoredFileId {
  return `local_${Buffer.from(key).toString("base64url")}`;
}

/** The current local adapter keeps its filesystem key private from application DTOs. */
export async function storeLocalFile(input: {
  ledgerId: LedgerId;
  key: string;
  bytes: Buffer;
  metadata: TrustedFileMetadata;
}): Promise<LocalStoredFileReceipt> {
  const storage = getLocalStorage();
  const legacyReadUrl = await storage.upload(input.key, input.bytes, input.metadata.contentType);
  return {
    file: {
      id: opaqueLocalFileId(input.key),
      ownerLedgerId: input.ledgerId,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    },
    legacyReadUrl,
  };
}

/**
 * Current task engine adapter. submitTask's infrastructure id is intentionally
 * discarded so callers only observe revision processing state.
 */
export function createCurrentProcessingPort<TInput>(input: {
  taskType: string;
  toTaskInput: (intent: ProcessingIntentContract) => TInput;
  metadata: (intent: ProcessingIntentContract) => {
    scopeId: string;
    entityType: string;
    entityId: string;
    title: string;
    deduplicationKey?: string;
  };
}): ProcessingPort {
  return {
    async dispatch(intent) {
      await submitTask(input.taskType, input.toTaskInput(intent), input.metadata(intent));
    },
    async claim() { return true; },
    async complete() {},
  };
}

export function createProcessingIntent(input: {
  sourceDocumentId: string;
  revisionId?: string;
  attempt?: number;
}): ProcessingIntentContract {
  return {
    id: crypto.randomUUID(),
    sourceDocumentId: input.sourceDocumentId,
    // Until task 4.1 creates revisions, the stable document identity is the current adapter's revision surrogate.
    revisionId: input.revisionId ?? input.sourceDocumentId,
    requestedAt: new Date().toISOString(),
    attempt: input.attempt ?? 1,
  };
}
