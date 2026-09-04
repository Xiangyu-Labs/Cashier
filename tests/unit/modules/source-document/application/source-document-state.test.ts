import { describe, expect, it } from "vitest";
import {
  deriveSourceDocumentCapabilities,
  transitionSourceDocument,
  type SourceDocumentState,
  type SourceDocumentStateEvent,
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
    ["duplicate_pending", true, false, ["keep_duplicate", "discard_duplicate", "delete"]],
    ["anomaly", true, false, ["abandon_candidate", "retry", "edit_retry", "delete"]],
    ["anomaly", false, false, ["retry", "edit_retry", "delete"]],
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

  it.each<[SourceDocumentState, SourceDocumentStateEvent, SourceDocumentState]>([
    [
      { status: "completed", hasActiveResult: true },
      { type: "install_retry" },
      { status: "processing", hasActiveResult: true },
    ],
    [
      { status: "processing", hasActiveResult: false },
      { type: "processing_succeeded", duplicate: false },
      { status: "completed", hasActiveResult: true },
    ],
    [
      { status: "processing", hasActiveResult: false },
      { type: "processing_succeeded", duplicate: true },
      { status: "duplicate_pending", hasActiveResult: true },
    ],
    [
      { status: "processing", hasActiveResult: true },
      { type: "processing_candidate_succeeded" },
      { status: "candidate_pending", hasActiveResult: true },
    ],
    [
      { status: "processing", hasActiveResult: true },
      { type: "processing_failed", outcome: "failed" },
      { status: "failed", hasActiveResult: true },
    ],
    [
      { status: "processing", hasActiveResult: false },
      { type: "cancel_processing" },
      { status: "cancelled", hasActiveResult: false },
    ],
    [
      { status: "candidate_pending", hasActiveResult: true },
      { type: "accept_candidate", duplicate: false },
      { status: "completed", hasActiveResult: true },
    ],
    [
      { status: "candidate_pending", hasActiveResult: true },
      { type: "abandon_candidate" },
      { status: "completed", hasActiveResult: true },
    ],
    [
      { status: "duplicate_pending", hasActiveResult: true },
      { type: "keep_duplicate" },
      { status: "completed", hasActiveResult: true },
    ],
  ])("transitions %#", (current, event, expected) => {
    expect(transitionSourceDocument(current, event)).toEqual(expected);
  });

  it.each([
    [
      { status: "completed", hasActiveResult: true },
      { type: "accept_candidate", duplicate: false },
    ],
    [{ status: "processing", hasActiveResult: false }, { type: "abandon_candidate" }],
    [{ status: "cancelled", hasActiveResult: false }, { type: "cancel_processing" }],
  ] as const)("rejects illegal transition %#", (current, event) => {
    expect(() => transitionSourceDocument(current, event)).toThrow(
      "Invalid source document transition"
    );
  });
});
