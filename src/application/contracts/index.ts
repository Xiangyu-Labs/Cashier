/**
 * Application contracts shared by the retained workflows. These types deliberately
 * describe business values only; persistence and provider details stay in adapters.
 */

export const APPLICATION_CONTRACT_VERSION = "1.0.0" as const;

export type SourceDocumentId = string;
export type RevisionId = string;
export type LedgerId = string;
export type StoredFileId = string;
export type UploadSessionId = string;
export type ProcessingIntentId = string;

export const REVISION_OUTCOMES = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
] as const;
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
  if (input.deleted) {
    return [];
  }

  if (input.pendingOutcome === "queued" || input.pendingOutcome === "processing") {
    return ["delete"];
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

export interface UploadFileRequestContract {
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  checksum?: string | null;
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
  ownerLedgerId?: LedgerId;
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
  claimToken: string;
  outcome: Extract<RevisionOutcome, "completed" | "anomaly" | "failed">;
  diagnostic?: ProcessingDiagnostic;
}

export interface ProcessingClaimContract {
  intent: ProcessingIntentContract;
  claimToken: string;
  expiresAt: string;
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

/** Public models are bounded target read contracts. */
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
  revisionId: RevisionId;
  revisionState: "queued";
}

export function toSourceDocumentSubmissionContract(
  sourceDocument: Pick<SourceDocumentContract, "id">,
  revision: Pick<SourceDocumentRevisionContract, "id" | "outcome">
): SourceDocumentSubmissionContract {
  return {
    sourceDocumentId: sourceDocument.id,
    revisionId: revision.id,
    revisionState: "queued",
  };
}

export interface SourceDocumentPort {
  get(ledgerId: LedgerId, id: SourceDocumentId): Promise<SourceDocumentContract | null>;
  list(input: {
    ledgerId: LedgerId;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: readonly SourceDocumentContract[]; nextCursor: string | null }>;
  createPending(input: {
    ledgerId: LedgerId;
    sourceDocumentId?: SourceDocumentId;
    submittedText?: string | null;
    storedFileIds?: readonly StoredFileId[];
    entryDate?: string | null;
  }): Promise<{ document: SourceDocumentContract; revision: SourceDocumentRevisionContract }>;
  markProcessing(input: {
    ledgerId: LedgerId;
    sourceDocumentId: SourceDocumentId;
    revisionId: RevisionId;
  }): Promise<boolean>;
  preserveTerminalOutcome(input: {
    ledgerId: LedgerId;
    sourceDocumentId: SourceDocumentId;
    revisionId: RevisionId;
    outcome: "anomaly" | "failed";
    anomalyReason?: string | null;
    failureCode?: string | null;
  }): Promise<boolean>;
  softDelete(ledgerId: LedgerId, sourceDocumentId: SourceDocumentId): Promise<boolean>;
}

export interface PendingRevisionSubmissionContract {
  document: SourceDocumentContract;
  revision: SourceDocumentRevisionContract;
  intent: ProcessingIntentContract;
}

/** Atomically persists submitted evidence and the durable work needed to process it. */
export interface SourceDocumentSubmissionPort {
  createPendingWithIntent(input: {
    ledgerId: LedgerId;
    sourceDocumentId?: SourceDocumentId;
    submittedText?: string | null;
    storedFileIds?: readonly StoredFileId[];
    entryDate?: string | null;
    inheritEvidence?: boolean;
  }): Promise<PendingRevisionSubmissionContract>;
}

export interface LedgerPort {
  getLedgerIdForCredential(credentialId: string): Promise<LedgerId | null>;
  isOwnedByUser(ledgerId: LedgerId, userId: string): Promise<boolean>;
  getOwned(ledgerId: LedgerId, userId: string): Promise<LedgerContract | null>;
  listIdsForUser(userId: string): Promise<readonly LedgerId[]>;
  listForUser(userId: string): Promise<readonly LedgerContract[]>;
  createDefault(input: {
    userId: string;
    settings: LedgerSettingsContract;
    categories: readonly CategoryMutationContract[];
  }): Promise<LedgerContract>;
  deleteOwned(
    ledgerId: LedgerId,
    userId: string
  ): Promise<"deleted" | "already_deleted" | "forbidden" | "not_found">;
}
export interface StatsPort {
  getSummary(ledgerId: LedgerId): Promise<unknown>;
}
export interface CategoryPort {
  list(ledgerId: LedgerId): Promise<readonly CategoryContract[]>;
  get(ledgerId: LedgerId, categoryId: string): Promise<CategoryContract | null>;
  listWithCount(ledgerId: LedgerId): Promise<readonly CategoryWithCountContract[]>;
  create(ledgerId: LedgerId, input: CategoryMutationContract): Promise<CategoryContract>;
  update(
    ledgerId: LedgerId,
    categoryId: string,
    input: Partial<CategoryMutationContract>
  ): Promise<CategoryContract | null>;
  delete(ledgerId: LedgerId, categoryId: string): Promise<boolean>;
  reorder(ledgerId: LedgerId, categoryIds: readonly string[]): Promise<number>;
  countUncategorized(ledgerId: LedgerId): Promise<number>;
}
export interface CurrencyPort {
  convert(amount: string, from: string, to: string, date?: string): Promise<string>;
  recalculateLedger(ledgerId: LedgerId, mainCurrency: string): Promise<number>;
}
export interface SettingsPort {
  get(ledgerId: LedgerId): Promise<LedgerSettingsContract | null>;
  update(input: {
    ledgerId: LedgerId;
    userId: string;
    settings: Partial<LedgerSettingsContract>;
  }): Promise<LedgerContract | null>;
}
export interface AuthenticationPort {
  requireUser(): Promise<{ id: string }>;
}
export interface ServiceCredentialPort {
  authenticate(key: string): Promise<AuthenticatedServiceCredentialContract | null>;
  list(ledgerId: LedgerId): Promise<readonly ServiceCredentialContract[]>;
  create(ledgerId: LedgerId, name: string): Promise<ServiceCredentialContract>;
  revoke(ledgerId: LedgerId, credentialId: string): Promise<boolean>;
}
export interface IdempotencyPort {
  execute<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

export interface EmailDeliveryPort {
  send(input: {
    from: string;
    to: string;
    subject: string;
    content: unknown;
  }): Promise<"sent" | "not_configured">;
}

export interface OtpTokenContract {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  attempts: number;
  lockedUntil: Date | null;
}

export interface OtpTokenPort {
  replace(input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
  }): Promise<void>;
  find(email: string): Promise<OtpTokenContract | null>;
  recordFailure(input: { email: string; attempts: number; lockedUntil?: Date }): Promise<void>;
  markVerified(email: string): Promise<void>;
  delete(email: string): Promise<void>;
  cleanupExpired(now: Date): Promise<number>;
}

export interface UserAccountContract {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface UserAccountPort {
  findOrCreate(
    email: string,
    name?: string
  ): Promise<{
    user: UserAccountContract;
    isExistingUser: boolean;
  }>;
  findByEmail(email: string): Promise<UserAccountContract | null>;
  findById(id: string): Promise<UserAccountContract | null>;
}

export interface CategoryMutationContract {
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface CategoryContract {
  id: string;
  ledgerId: LedgerId;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryWithCountContract extends CategoryContract {
  entryCount: number;
}

export interface LedgerSettingsContract {
  aiLanguage?: string;
  currencies?: string[];
  mainCurrency?: string;
  collapseEntriesDefault?: boolean;
  aiCustomPrompt?: string;
}

export interface LedgerContract {
  id: LedgerId;
  userId: string;
  settings: LedgerSettingsContract;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedServiceCredentialContract {
  id: string;
  ledgerId: LedgerId;
}

export interface ServiceCredentialContract extends AuthenticatedServiceCredentialContract {
  key: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface StoredFilePort {
  createUploadPlan(
    ledgerId: LedgerId,
    files?: readonly UploadFileRequestContract[]
  ): Promise<UploadPlanContract>;
  finalizeUpload(input: UploadFinalizationContract): Promise<readonly StoredFileContract[]>;
  readAuthorized(
    ledgerId: LedgerId,
    fileId: StoredFileId
  ): Promise<AuthorizedFileReadContract | null>;
}

export interface LedgerProjectionEntryContract {
  id?: string;
  categoryId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
  createdAt?: string;
}

export interface LedgerProjectionPort {
  activateRevision(input: {
    ledgerId: LedgerId;
    sourceDocumentId: SourceDocumentId;
    revisionId: RevisionId;
    title?: string | null;
    entries: readonly LedgerProjectionEntryContract[];
  }): Promise<boolean>;
  createManual(input: {
    ledgerId: LedgerId;
    sourceDocumentId?: SourceDocumentId;
    submittedText?: string | null;
    title?: string | null;
    entryDate?: string | null;
    entries: readonly LedgerProjectionEntryContract[];
  }): Promise<{ sourceDocumentId: SourceDocumentId; revisionId: RevisionId }>;
  replaceManual(input: {
    ledgerId: LedgerId;
    sourceDocumentId: SourceDocumentId;
    expectedActiveRevisionId?: RevisionId;
    submittedText?: string | null;
    title?: string | null;
    entryDate?: string | null;
    entries: readonly LedgerProjectionEntryContract[];
  }): Promise<RevisionId>;
  replaceActive(input: {
    ledgerId: LedgerId;
    sourceDocumentId: SourceDocumentId;
    expectedActiveRevisionId: RevisionId;
    entries: readonly LedgerProjectionEntryContract[];
  }): Promise<RevisionId>;
  recalculate(input: {
    ledgerId: LedgerId;
    updates: readonly { ledgerEntryId: string; convertedAmount: string; exchangeRate: string }[];
  }): Promise<number>;
  softDelete(ledgerId: LedgerId, sourceDocumentId: SourceDocumentId): Promise<boolean>;
}

export interface ProcessingPort {
  dispatch(intent: ProcessingIntentContract): Promise<void>;
  claim(intentId: ProcessingIntentId): Promise<ProcessingClaimContract | null>;
  complete(result: ProcessingCompletionContract): Promise<boolean>;
}

export interface RevisionProcessingRequestContract {
  ledgerId: LedgerId;
  sourceDocumentId: SourceDocumentId;
  revisionId: RevisionId;
}

export interface RevisionProcessingResultContract {
  outcome: Extract<RevisionOutcome, "completed" | "anomaly">;
  anomalyReason?: string;
}

export interface RevisionProcessorPort {
  process(request: RevisionProcessingRequestContract): Promise<RevisionProcessingResultContract>;
}
