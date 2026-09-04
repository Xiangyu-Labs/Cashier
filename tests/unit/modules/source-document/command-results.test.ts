import { describe, expect, it } from "vitest";
import {
  SourceDocumentStaleCommandError,
  unwrapAtomicBatchCommandResult,
  unwrapVersionedCommandResult,
} from "@/modules/source-document/command-results";

describe("source document command result unwrapping", () => {
  it("unwraps versioned and atomic successes", () => {
    expect(
      unwrapVersionedCommandResult({
        ok: true,
        sourceDocumentId: "document-1",
        version: 2,
        data: { value: 1 },
      })
    ).toEqual({ value: 1 });
    expect(
      unwrapAtomicBatchCommandResult({
        ok: true,
        versions: [{ sourceDocumentId: "document-1", version: 2 }],
        data: { value: 2 },
      })
    ).toEqual({ value: 2 });
  });

  it("throws a typed error with every stale target", () => {
    const staleTargets = [
      { sourceDocumentId: "document-1", expectedVersion: 1, currentVersion: 2 },
      { sourceDocumentId: "document-2", expectedVersion: 3, currentVersion: 4 },
    ];

    expect(() =>
      unwrapAtomicBatchCommandResult({ ok: false, reason: "stale", staleTargets })
    ).toThrowError(
      expect.objectContaining({
        code: "SOURCE_DOCUMENT_STALE",
        staleTargets,
      })
    );
  });

  it("converts a versioned stale result into a single stale target", () => {
    try {
      unwrapVersionedCommandResult({
        ok: false,
        reason: "stale",
        sourceDocumentId: "document-1",
        expectedVersion: 1,
        currentVersion: 2,
      });
      throw new Error("Expected stale command to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SourceDocumentStaleCommandError);
      expect((error as SourceDocumentStaleCommandError).staleTargets).toEqual([
        { sourceDocumentId: "document-1", expectedVersion: 1, currentVersion: 2 },
      ]);
    }
  });
});
