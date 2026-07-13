/**
 * Application contracts shared by the retained workflows. These types deliberately
 * describe business values only; persistence and provider details stay in adapters.
 */

export type SourceDocumentId = string;
export type RevisionId = string;
export type LedgerId = string;
export type StoredFileId = string;
export type UploadSessionId = string;
export type ProcessingIntentId = string;

export const REVISION_OUTCOMES = ["queued", "processing", "completed", "anomaly", "failed"] as const;
export type RevisionOutcome = (typeof REVISION_OUTCOMES)[number];

export type SupportedSourceDocumentAction = "retry" | "edit_retry" | "manual_correction" | "delete";

export interface SourceDocumentContract {
  id: SourceDocumentId;
  ledgerId: LedgerId;
  activeRevisionId: RevisionId | null;
  pendingRevisionId: RevisionId | null;
  supportedActions: readonly SupportedSourceDocumentAction[];
}

export interface SourceDocumentRevisionContract {
  id: RevisionId;
  sourceDocumentId: SourceDocumentId;
  outcome: RevisionOutcome;
  submittedAt: string;
  finalizedAt: string | null;
}

export function supportedSourceDocumentActions(input: {
  activeRevisionId: RevisionId | null;
  pendingOutcome: RevisionOutcome | null;
  deleted?: boolean;
}): readonly SupportedSourceDocumentAction[] {
  if (input.deleted || input.pendingOutcome === "queued" || input.pendingOutcome === "processing") {
    return [];
  }

  if (input.pendingOutcome === "anomaly" || input.pendingOutcome === "failed") {
    return input.activeRevisionId == null
      ? ["retry", "edit_retry", "manual_correction", "delete"]
      : ["retry", "edit_retry", "manual_correction", "delete"];
  }

  return ["retry", "edit_retry", "delete"];
}

export interface TrustedFileMetadata {
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  checksum: string | null;
}

export interface StoredFileContract {
  id: StoredFileId;
  ownerLedgerId: LedgerId;
  metadata: TrustedFileMetadata;
  createdAt: string;
}

export interface UploadTargetContract {
  id: string;
  method: "PUT" | "POST";
  url: string;
  requiredHeaders: Readonly<Record<string, string>>;
}

export interface UploadPlanContract {
  id: UploadSessionId;
  expiresAt: string;
  targets: readonly UploadTargetContract[];
  finalizationToken: string;
  maxFiles: number;
  maxBytesPerFile: number;
}

export interface UploadFinalizationContract {
  uploadSessionId: UploadSessionId;
  finalizationToken: string;
  targetIds: readonly string[];
}

export interface AuthorizedFileReadContract {
  file: StoredFileContract;
  body: Uint8Array;
}

export interface ProcessingIntentContract {
  id: ProcessingIntentId;
  sourceDocumentId: SourceDocumentId;
  revisionId: RevisionId;
  requestedAt: string;
  attempt: number;
}

export type ProcessingRetryClassification = "retryable" | "permanent" | "anomaly";

export interface ProcessingDiagnostic {
  correlationId: string;
  code: ApplicationErrorCode;
}

export interface ProcessingCompletionContract {
  intentId: ProcessingIntentId;
  outcome: Extract<RevisionOutcome, "completed" | "anomaly" | "failed">;
  diagnostic?: ProcessingDiagnostic;
}

export type ApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PROCESSING_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL";

export interface ApplicationErrorContract {
  code: ApplicationErrorCode;
  message: string;
  correlationId?: string;
}

/** Public models remain bounded while legacy reads are still active. */
export interface SourceDocumentListContract {
  id: SourceDocumentId;
  ledgerId: LedgerId;
  title: string | null;
  status: RevisionOutcome | "deleted";
  entryDate: string | null;
  hasFiles: boolean;
  supportedActions: readonly SupportedSourceDocumentAction[];
  createdAt: string;
  updatedAt: string;
}

export interface SourceDocumentDetailContract extends SourceDocumentListContract {
  text: string | null;
  files: readonly Pick<StoredFileContract, "id" | "metadata">[];
  anomalyReason: string | null;
}

export interface SourceDocumentSubmissionContract {
  sourceDocumentId: SourceDocumentId;
  status: "queued";
}

/** Compatibility projection used until retained callers move to revision DTOs. */
export function toSourceDocumentSubmissionContract(
  sourceDocument: Pick<SourceDocumentContract, "id">
): SourceDocumentSubmissionContract {
  return { sourceDocumentId: sourceDocument.id, status: "queued" };
}

export interface SourceDocumentPort {
  get(id: SourceDocumentId): Promise<SourceDocumentContract | null>;
}

export interface LedgerPort { getLedgerIdForCredential(credentialId: string): Promise<LedgerId | null>; }
export interface StatsPort { getSummary(ledgerId: LedgerId): Promise<unknown>; }
export interface CategoryPort { list(ledgerId: LedgerId): Promise<readonly unknown[]>; }
export interface CurrencyPort { convert(amount: string, from: string, to: string): Promise<string>; }
export interface SettingsPort { get(ledgerId: LedgerId): Promise<unknown>; }
export interface AuthenticationPort { requireUser(): Promise<{ id: string }>; }
export interface ServiceCredentialPort { authenticate(key: string): Promise<{ id: string; ledgerId: LedgerId } | null>; }
export interface IdempotencyPort { execute<T>(key: string, operation: () => Promise<T>): Promise<T>; }

export interface StoredFilePort {
  createUploadPlan(ledgerId: LedgerId): Promise<UploadPlanContract>;
  finalizeUpload(input: UploadFinalizationContract): Promise<readonly StoredFileContract[]>;
  readAuthorized(ledgerId: LedgerId, fileId: StoredFileId): Promise<AuthorizedFileReadContract | null>;
}

export interface ProcessingPort {
  dispatch(intent: ProcessingIntentContract): Promise<void>;
  claim(intentId: ProcessingIntentId): Promise<boolean>;
  complete(result: ProcessingCompletionContract): Promise<void>;
}
