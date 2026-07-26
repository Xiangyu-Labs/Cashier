/**
 * Application contracts shared by the retained workflows. These types deliberately
 * describe business values only; persistence and provider details stay in adapters.
 */

export const APPLICATION_CONTRACT_VERSION = "2.0.0" as const;

export type SourceDocumentId = string;
export type RevisionId = string;
export type LedgerId = string;
export type StoredFileId = string;
export type UploadSessionId = string;
export type ProcessingIntentId = string;

export const REVISION_OUTCOMES = [
  "processing",
  "completed",
  "anomaly",
  "failed",
  "abandoned",
] as const;
export type RevisionOutcome = (typeof REVISION_OUTCOMES)[number];

export type SupportedSourceDocumentAction =
  | "retry"
  | "edit_retry"
  | "delete"
  | "accept_candidate"
  | "abandon_candidate";

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

  if (input.pendingOutcome === "processing") {
    return ["delete"];
  }

  if (input.pendingOutcome === "anomaly" || input.pendingOutcome === "failed") {
    return ["retry", "edit_retry", "delete"];
  }

  // Document has an existing active projection and a completed pending revision -> candidate pending
  if (input.activeRevisionId != null && input.pendingOutcome === "completed") {
    return ["accept_candidate", "abandon_candidate", "delete"];
  }

  // First parse completed successfully (no active revision yet)
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
  stableCode?: AnomalyCode | ProcessingFailureCode;
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

/**
 * Stable, user-facing anomaly codes for documents that parsed but need user attention.
 * These are localized and sanitized before being shown in the UI.
 */
export const ANOMALY_CODES = [
  "insufficient_evidence",
  "currency_required",
  "amount_conflict",
  "unsupported_document",
] as const;
export type AnomalyCode = (typeof ANOMALY_CODES)[number];

/**
 * Stable, user-facing processing failure codes for documents that failed to parse.
 * These are localized and sanitized before being shown in the UI.
 */
export const PROCESSING_FAILURE_CODES = [
  "ai_provider_unavailable",
  "ai_schema_invalid",
  "exchange_rate_failure",
  "storage_failure",
  "processing_unavailable",
  "database_unavailable",
  "request_bound_retry_exhausted",
  "processing_timeout",
] as const;
export type ProcessingFailureCode = (typeof PROCESSING_FAILURE_CODES)[number];

/**
 * Map a legacy or unknown failure code to a stable ProcessingFailureCode.
 * Unknown values are mapped to "processing_unavailable" without discarding
 * the original stored value in the database.
 */
export function toStableFailureCode(legacyCode: string | null | undefined): ProcessingFailureCode {
  if (legacyCode == null) return "processing_unavailable";

  // Direct matches for known stable codes
  if ((PROCESSING_FAILURE_CODES as readonly string[]).includes(legacyCode)) {
    return legacyCode as ProcessingFailureCode;
  }

  // Map legacy ApplicationErrorCode values to stable codes
  switch (legacyCode) {
    case "INTERNAL":
    case "VALIDATION_FAILED":
      return "ai_schema_invalid";
    case "RATE_LIMITED":
      return "ai_provider_unavailable";
    case "STORAGE_UNAVAILABLE":
      return "storage_failure";
    case "NOT_FOUND":
    case "CONFLICT":
      return "database_unavailable";
    default:
      return "processing_unavailable";
  }
}

/**
 * Map a legacy anomaly reason string to a stable AnomalyCode.
 * Falls back to "insufficient_evidence" for unknown values.
 */
export function toStableAnomalyCode(reason: string | null | undefined): AnomalyCode {
  if (reason == null) return "insufficient_evidence";

  const normalized = reason.toLowerCase().replace(/\s+/g, "_");

  if ((ANOMALY_CODES as readonly string[]).includes(normalized)) {
    return normalized as AnomalyCode;
  }

  // Map common legacy values
  if (normalized.includes("currency") || normalized.includes("unknown_currency")) {
    return "currency_required";
  }
  if (
    normalized.includes("amount") ||
    normalized.includes("conflict") ||
    normalized.includes("diverg")
  ) {
    return "amount_conflict";
  }
  if (
    normalized.includes("unsupported") ||
    normalized.includes("invalid") ||
    normalized.includes("unrecognized")
  ) {
    return "unsupported_document";
  }
  if (
    normalized.includes("evidence") ||
    normalized.includes("content") ||
    normalized.includes("anomaly")
  ) {
    return "insufficient_evidence";
  }

  return "insufficient_evidence";
}

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
  errorCode: ApplicationErrorCode | ProcessingFailureCode | null;
  stableErrorCode: AnomalyCode | ProcessingFailureCode | null;
}

export interface SourceDocumentSubmissionContract {
  sourceDocumentId: SourceDocumentId;
  revisionId: RevisionId;
  revisionState: "processing";
}

export function toSourceDocumentSubmissionContract(
  sourceDocument: Pick<SourceDocumentContract, "id">,
  revision: Pick<SourceDocumentRevisionContract, "id" | "outcome">
): SourceDocumentSubmissionContract {
  return {
    sourceDocumentId: sourceDocument.id,
    revisionId: revision.id,
    revisionState: "processing",
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
  create(ledgerId: LedgerId, name: string): Promise<CreatedServiceCredentialContract>;
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
  tokenPrefix: string;
  tokenSuffix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedServiceCredentialContract extends ServiceCredentialContract {
  token: string;
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

export interface DirectStoredFilePort extends StoredFilePort {
  createDirectUploadPlan(
    ledgerId: LedgerId,
    files: readonly UploadFileRequestContract[]
  ): Promise<UploadPlanContract>;
  finalizeDirectUpload(input: UploadFinalizationContract): Promise<readonly StoredFileContract[]>;
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
}

export interface RevisionProcessingResultContract {
  outcome: Extract<RevisionOutcome, "completed" | "anomaly">;
  anomalyReason?: string;
}

export interface RevisionProcessorPort {
  process(request: RevisionProcessingRequestContract): Promise<RevisionProcessingResultContract>;
}
