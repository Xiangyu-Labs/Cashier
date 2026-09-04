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
  | { type: "cancel_processing" }
  | { type: "accept_candidate"; duplicate: boolean }
  | { type: "abandon_candidate" }
  | { type: "keep_duplicate" }
  | { type: "discard_duplicate" };

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
): SourceDocumentState {
  switch (event.type) {
    case "install_retry":
      return { status: "processing", hasActiveResult: current.hasActiveResult };
    case "processing_succeeded":
      if (current.status !== "processing" || current.hasActiveResult) {
        return invalidTransition(current, event);
      }
      return {
        status: event.duplicate ? "duplicate_pending" : "completed",
        hasActiveResult: true,
      };
    case "processing_candidate_succeeded":
      if (current.status !== "processing" || !current.hasActiveResult) {
        return invalidTransition(current, event);
      }
      return { status: "candidate_pending", hasActiveResult: true };
    case "processing_failed":
      if (current.status !== "processing") return invalidTransition(current, event);
      return { status: event.outcome, hasActiveResult: current.hasActiveResult };
    case "cancel_processing":
      if (current.status !== "processing") return invalidTransition(current, event);
      return {
        status: current.hasActiveResult ? "completed" : "cancelled",
        hasActiveResult: current.hasActiveResult,
      };
    case "accept_candidate":
      if (current.status !== "candidate_pending") return invalidTransition(current, event);
      return {
        status: event.duplicate ? "duplicate_pending" : "completed",
        hasActiveResult: true,
      };
    case "abandon_candidate":
      if (
        !current.hasActiveResult ||
        !["candidate_pending", "anomaly", "failed"].includes(current.status)
      ) {
        return invalidTransition(current, event);
      }
      return { status: "completed", hasActiveResult: true };
    case "keep_duplicate":
      if (current.status !== "duplicate_pending") return invalidTransition(current, event);
      return { status: "completed", hasActiveResult: true };
    case "discard_duplicate":
      if (current.status !== "duplicate_pending") return invalidTransition(current, event);
      return { status: "completed", hasActiveResult: true };
  }
}
