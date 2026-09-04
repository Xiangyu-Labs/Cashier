import type { SupportedSourceDocumentAction } from "@/application/contracts";
import type { SourceDocumentStatusType } from "../types";

export interface SourceDocumentState {
  status: SourceDocumentStatusType;
  hasActiveResult: boolean;
}

export type SourceDocumentStateEvent =
  | { type: "install_retry" }
  | { type: "processing_succeeded"; duplicate: boolean }
  | { type: "processing_candidate_succeeded" }
  | { type: "processing_failed"; outcome: "anomaly" | "failed" }
  | { type: "cancel_processing"; activeDuplicateReviewPending: boolean }
  | { type: "accept_candidate"; duplicate: boolean }
  | { type: "abandon_candidate"; activeDuplicateReviewPending: boolean }
  | { type: "keep_duplicate" }
  | { type: "discard_duplicate" };

/**
 * `disposition` separates "what the row's logical status is" from "whether
 * the row stays visible". `discard_duplicate` never produces a `completed`
 * status — the underlying document is soft-deleted, and its `currentStatus`
 * column is deliberately left untouched by the write path, so the state here
 * is unchanged from the input and only the disposition flips.
 */
export interface SourceDocumentTransitionResult {
  state: SourceDocumentState;
  disposition: "active" | "soft_deleted";
}

export function deriveSourceDocumentCapabilities(input: SourceDocumentState): {
  canEdit: boolean;
  supportedActions: SupportedSourceDocumentAction[];
} {
  switch (input.status) {
    case "completed":
      return input.hasActiveResult
        ? {
            canEdit: true,
            supportedActions: ["split_entries", "retry", "edit_retry", "delete"],
          }
        : { canEdit: false, supportedActions: ["retry", "edit_retry", "delete"] };
    case "processing":
      return {
        canEdit: false,
        supportedActions: ["cancel_processing", "retry", "edit_retry", "delete"],
      };
    case "candidate_pending":
      return {
        canEdit: false,
        supportedActions: [
          "accept_candidate",
          "abandon_candidate",
          "retry",
          "edit_retry",
          "delete",
        ],
      };
    case "duplicate_pending":
      return {
        canEdit: false,
        supportedActions: ["keep_duplicate", "discard_duplicate", "delete"],
      };
    case "anomaly":
    case "failed":
      return {
        canEdit: false,
        supportedActions: input.hasActiveResult
          ? ["abandon_candidate", "retry", "edit_retry", "delete"]
          : ["retry", "edit_retry", "delete"],
      };
    case "cancelled":
      return { canEdit: false, supportedActions: ["retry", "edit_retry", "delete"] };
  }
}

function invalidTransition(state: SourceDocumentState, event: SourceDocumentStateEvent): never {
  throw new Error(`Invalid source document transition: ${state.status} -> ${event.type}`);
}

export function transitionSourceDocument(
  current: SourceDocumentState,
  event: SourceDocumentStateEvent
): SourceDocumentTransitionResult {
  switch (event.type) {
    case "install_retry":
      return {
        state: { status: "processing", hasActiveResult: current.hasActiveResult },
        disposition: "active",
      };
    case "processing_succeeded":
      if (current.status !== "processing" || current.hasActiveResult) {
        return invalidTransition(current, event);
      }
      return {
        state: {
          status: event.duplicate ? "duplicate_pending" : "completed",
          hasActiveResult: true,
        },
        disposition: "active",
      };
    case "processing_candidate_succeeded":
      if (current.status !== "processing" || !current.hasActiveResult) {
        return invalidTransition(current, event);
      }
      return {
        state: { status: "candidate_pending", hasActiveResult: true },
        disposition: "active",
      };
    case "processing_failed":
      if (current.status !== "processing") return invalidTransition(current, event);
      return {
        state: { status: event.outcome, hasActiveResult: current.hasActiveResult },
        disposition: "active",
      };
    case "cancel_processing":
      if (current.status !== "processing") return invalidTransition(current, event);
      return {
        state: {
          status: current.hasActiveResult
            ? event.activeDuplicateReviewPending
              ? "duplicate_pending"
              : "completed"
            : "cancelled",
          hasActiveResult: current.hasActiveResult,
        },
        disposition: "active",
      };
    case "accept_candidate":
      if (current.status !== "candidate_pending") return invalidTransition(current, event);
      return {
        state: {
          status: event.duplicate ? "duplicate_pending" : "completed",
          hasActiveResult: true,
        },
        disposition: "active",
      };
    case "abandon_candidate":
      if (
        !current.hasActiveResult ||
        !["candidate_pending", "anomaly", "failed"].includes(current.status)
      ) {
        return invalidTransition(current, event);
      }
      return {
        state: {
          status: event.activeDuplicateReviewPending ? "duplicate_pending" : "completed",
          hasActiveResult: true,
        },
        disposition: "active",
      };
    case "keep_duplicate":
      if (current.status !== "duplicate_pending") return invalidTransition(current, event);
      return {
        state: { status: "completed", hasActiveResult: true },
        disposition: "active",
      };
    case "discard_duplicate":
      if (current.status !== "duplicate_pending") return invalidTransition(current, event);
      return { state: current, disposition: "soft_deleted" };
  }
}
