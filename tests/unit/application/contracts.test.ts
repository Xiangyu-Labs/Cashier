import { describe, expect, it } from "vitest";
import fixture from "@/../tests/fixtures/api-v1/source-documents.post.json";
import {
  apiV1Compatibility,
  toApiV1SourceDocumentCreateResponse,
} from "@/app/api/v1/_shared/compatibility";
import { toApplicationError } from "@/application/contracts/errors";
import { AppError } from "@/lib/errors";
import { supportedSourceDocumentActions } from "@/application/contracts";

describe("target application contracts", () => {
  it("preserves an active result while a retry is anomalous or failed", () => {
    expect(supportedSourceDocumentActions({ activeRevisionId: "revision-1", pendingOutcome: "failed" }))
      .toEqual(["retry", "edit_retry", "manual_correction", "delete"]);
    expect(supportedSourceDocumentActions({ activeRevisionId: "revision-1", pendingOutcome: "processing" }))
      .toEqual(["delete"]);
  });

  it("does not allow actions for deleted source documents", () => {
    expect(supportedSourceDocumentActions({ activeRevisionId: null, pendingOutcome: "failed", deleted: true }))
      .toEqual([]);
  });

  it("maps infrastructure failures to stable, non-sensitive application errors", () => {
    const error = toApplicationError(
      new AppError("Failed to download /private/uploads/secret.jpg", "LOCAL_STORAGE_DOWNLOAD_FAILED")
    );

    expect(error.code).toBe("STORAGE_UNAVAILABLE");
    expect(error.message).not.toContain("/private");
    expect(error.correlationId).toBeTypeOf("string");
  });

  it("keeps the published API v1 response fixture and compatibility window", () => {
    const response = fixture.response as {
      sourceDocumentId: string;
      revisionId: string;
      revisionState: "queued";
    };
    expect(toApiV1SourceDocumentCreateResponse(response)).toEqual(fixture.response);
    expect(apiV1Compatibility.version).toBe(fixture.compatibility.version);
    expect(apiV1Compatibility.additiveUntil).toBe(fixture.compatibility.additiveUntil);
    expect(apiV1Compatibility.deprecatedTaskFields).toEqual(fixture.compatibility.deprecatedTaskFields);
  });
});
