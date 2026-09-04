import type {
  LedgerId,
  ProcessingClaimContract,
  ProcessingCompletionContract,
  ProcessingIntentContract,
  ProcessingIntentId,
  ProcessingLeaseContract,
  RevisionId,
  RevisionOutcome,
  SourceDocumentId,
} from "./source-documents";

export interface ProcessingPort {
  dispatch(intent: ProcessingIntentContract): Promise<void>;
  claim(intentId: ProcessingIntentId): Promise<ProcessingClaimContract | null>;
  renew(intentId: ProcessingIntentId, claimToken: string): Promise<string | null>;
  complete(result: ProcessingCompletionContract): Promise<boolean>;
}

export interface RecoverableProcessingIntentContract extends ProcessingIntentContract {
  scheduleAttemptCount: number;
  nextAvailableAt: string;
}

export interface ProcessingRecoveryConfig {
  maxBatch: number;
  maxAttempts: number;
  cooldownSeconds: number;
}

export interface RevisionProcessingRequestContract {
  ledgerId: LedgerId;
  sourceDocumentId: SourceDocumentId;
  revisionId: RevisionId;
  signal?: AbortSignal;
  lease?: ProcessingLeaseContract;
}

export interface RevisionProcessingResultContract {
  outcome: Extract<RevisionOutcome, "completed" | "anomaly">;
  anomalyReason?: string;
}

export interface RevisionProcessingContextContract {
  revision: { submittedText: string | null; outcome: RevisionOutcome } | null;
  document: {
    activeRevisionId: RevisionId | null;
    pendingRevisionId: RevisionId | null;
    type: "ai_parsed" | "manual";
    entryDate: string | null;
    createdAt: Date;
  } | null;
  storedFileIds: string[];
  categories: Array<{ id: string; name: string; description: string | null }>;
}

export interface RevisionProcessorPort {
  process(request: RevisionProcessingRequestContract): Promise<RevisionProcessingResultContract>;
}
