/**
 * Application contracts shared by the retained workflows. These types deliberately
 * describe business values only; persistence and provider details stay in adapters.
 */

import type { ApplicationErrorCode } from "./errors";

export type { ApplicationErrorCode, ApplicationErrorContract } from "./errors";

export type SourceDocumentId = string;
export type RevisionId = string;
export type LedgerId = string;
export type StoredFileId = string;
export type UploadSessionId = string;
export type ProcessingIntentId = string;

export type RevisionOutcome =
  "processing" | "completed" | "anomaly" | "failed" | "cancelled" | "abandoned";

export type SupportedSourceDocumentAction =
  | "retry"
  | "edit_retry"
  | "delete"
  | "accept_candidate"
  | "abandon_candidate"
  | "cancel_processing"
  | "split_entries"
  | "keep_duplicate"
  | "discard_duplicate";

export interface SourceDocumentContract {
  id: SourceDocumentId;
  ledgerId: LedgerId;
  version: number;
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
  pendingRevisionId?: RevisionId | null;
  pendingOutcome: RevisionOutcome | null;
  duplicateReviewPending?: boolean;
  deleted?: boolean;
}): readonly SupportedSourceDocumentAction[] {
  if (input.deleted) {
    return [];
  }

  if (input.duplicateReviewPending === true) {
    return ["keep_duplicate", "discard_duplicate", "delete"];
  }

  if (input.pendingOutcome === "processing") {
    return ["cancel_processing", "retry", "edit_retry", "delete"];
  }

  if (input.pendingOutcome === "anomaly" || input.pendingOutcome === "failed") {
    if (input.activeRevisionId != null) {
      return ["abandon_candidate", "retry", "edit_retry", "delete"];
    }
    return ["retry", "edit_retry", "delete"];
  }

  // Document has an existing active projection and a completed pending revision -> candidate pending
  if (input.activeRevisionId != null && input.pendingOutcome === "completed") {
    return ["accept_candidate", "abandon_candidate", "retry", "edit_retry", "delete"];
  }

  // First parse completed successfully (no active revision yet). This is
  // retained for compatibility with pre-migration rows; new duplicate reviews
  // use duplicateReviewPending above while the revision is already active.
  if (input.pendingOutcome === "completed") {
    return ["keep_duplicate", "discard_duplicate", "delete"];
  }
  const hasPendingRevision =
    input.pendingRevisionId === undefined
      ? input.pendingOutcome != null
      : input.pendingRevisionId != null;
  if (input.activeRevisionId != null && !hasPendingRevision && input.pendingOutcome == null) {
    return ["split_entries", "retry", "edit_retry", "delete"];
  }
  return ["retry", "edit_retry", "delete"];
}

export interface ProcessingIntentContract {
  id: ProcessingIntentId;
  sourceDocumentId: SourceDocumentId;
  revisionId: RevisionId;
  requestedAt: string;
  attempt: number;
}

/**
 * Claim identity for a leased processing worker. Writes that finalize a
 * revision or projection must verify this lease inside their transaction so a
 * worker whose lease was lost or reclaimed cannot commit stale results.
 */
export interface ProcessingLeaseContract {
  intentId: ProcessingIntentId;
  claimToken: string;
}

interface ProcessingDiagnostic {
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

/**
 * Stable, user-facing anomaly codes for documents that parsed but need user attention.
 * These are localized and sanitized before being shown in the UI.
 */
const ANOMALY_CODES = [
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
    lease?: ProcessingLeaseContract;
  }): Promise<boolean>;
  softDelete(ledgerId: LedgerId, sourceDocumentId: SourceDocumentId): Promise<boolean>;
}

export interface PendingRevisionSubmissionContract {
  document: SourceDocumentContract;
  revision: SourceDocumentRevisionContract;
  intent: ProcessingIntentContract;
  /** True when the result was replayed from an already-completed idempotent request. */
  idempotencyReplay?: boolean;
}

/** Atomically persists submitted evidence and the durable work needed to process it. */
export interface SourceDocumentSubmissionInput {
  ledgerId: LedgerId;
  sourceDocumentId?: SourceDocumentId;
  expectedVersion?: number;
  submittedText?: string | null;
  storedFileIds?: readonly StoredFileId[];
  entryDate?: string | null;
  inheritEvidence?: boolean;
  supersedeProcessing?: boolean;
}

export interface SourceDocumentIdempotencyInput {
  principalType: "credential" | "user";
  principalId: string;
  key: string;
  contentFingerprint: string | null;
}

export interface SourceDocumentSubmissionPort {
  createPendingWithIntent(
    input: SourceDocumentSubmissionInput
  ): Promise<PendingRevisionSubmissionContract>;
  createIdempotentPendingWithIntent?(
    idempotency: SourceDocumentIdempotencyInput,
    prepare: () => Promise<SourceDocumentSubmissionInput>
  ): Promise<PendingRevisionSubmissionContract>;
}
