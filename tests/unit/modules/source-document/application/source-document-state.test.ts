import { describe, expect, it } from "vitest";
import {
  deriveSourceDocumentCapabilities,
  transitionSourceDocument,
  type SourceDocumentState,
  type SourceDocumentStateEvent,
  type SourceDocumentTransitionResult,
} from "@/modules/source-document/application/source-document-state";

describe("source-document state model", () => {
  it.each([
    ["completed", true, true, ["split_entries", "retry", "edit_retry", "delete"]],
    ["completed", false, false, ["retry", "edit_retry", "delete"]],
    ["processing", false, false, ["cancel_processing", "retry", "edit_retry", "delete"]],
    ["processing", true, false, ["cancel_processing", "retry", "edit_retry", "delete"]],
    [
      "candidate_pending",
      true,
      false,
      ["accept_candidate", "abandon_candidate", "retry", "edit_retry", "delete"],
    ],
    ["invalid", true, false, ["abandon_candidate", "retry", "edit_retry", "delete"]],
    ["invalid", false, false, ["retry", "edit_retry", "delete"]],
    ["failed", true, false, ["abandon_candidate", "retry", "edit_retry", "delete"]],
    ["failed", false, false, ["retry", "edit_retry", "delete"]],
    ["cancelled", false, false, ["retry", "edit_retry", "delete"]],
  ] as const)(
    "derives %s capabilities with active=%s",
    (status, hasActiveResult, canEdit, actions) => {
      expect(deriveSourceDocumentCapabilities({ status, hasActiveResult })).toEqual({
        canEdit,
        supportedActions: actions,
      });
    }
  );

  it.each<[SourceDocumentState, SourceDocumentStateEvent, SourceDocumentTransitionResult]>([
    [
      { status: "completed", hasActiveResult: true },
      { type: "install_retry" },
      { state: { status: "processing", hasActiveResult: true }, disposition: "active" },
    ],
    [
      { status: "processing", hasActiveResult: false },
      { type: "processing_succeeded" },
      { state: { status: "completed", hasActiveResult: true }, disposition: "active" },
    ],
    [
      { status: "processing", hasActiveResult: true },
      { type: "processing_candidate_succeeded" },
      { state: { status: "candidate_pending", hasActiveResult: true }, disposition: "active" },
    ],
    [
      { status: "processing", hasActiveResult: true },
      { type: "processing_failed", outcome: "failed" },
      { state: { status: "failed", hasActiveResult: true }, disposition: "active" },
    ],
    [
      { status: "processing", hasActiveResult: false },
      { type: "cancel_processing" },
      { state: { status: "cancelled", hasActiveResult: false }, disposition: "active" },
    ],
    [
      { status: "processing", hasActiveResult: true },
      { type: "cancel_processing" },
      { state: { status: "completed", hasActiveResult: true }, disposition: "active" },
    ],
    [
      { status: "candidate_pending", hasActiveResult: true },
      { type: "accept_candidate" },
      { state: { status: "completed", hasActiveResult: true }, disposition: "active" },
    ],
    [
      { status: "candidate_pending", hasActiveResult: true },
      { type: "abandon_candidate" },
      { state: { status: "completed", hasActiveResult: true }, disposition: "active" },
    ],
  ])("transitions %#", (current, event, expected) => {
    expect(transitionSourceDocument(current, event)).toEqual(expected);
  });

  it.each([
    [{ status: "completed", hasActiveResult: true }, { type: "accept_candidate" }],
    [{ status: "processing", hasActiveResult: false }, { type: "abandon_candidate" }],
    [{ status: "cancelled", hasActiveResult: false }, { type: "cancel_processing" }],
  ] as const)("rejects illegal transition %#", (current, event) => {
    expect(() => transitionSourceDocument(current, event)).toThrow(
      "Invalid source document transition"
    );
  });
});
