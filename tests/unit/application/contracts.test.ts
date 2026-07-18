import { describe, expect, it } from "vitest";
import fixture from "@/../tests/fixtures/api-v1/source-documents.post.json";
import {
  apiV1Compatibility,
  toApiV1SourceDocumentCreateResponse,
} from "@/app/api/v1/_shared/compatibility";
import { toApplicationError } from "@/application/contracts/errors";
import { AppError } from "@/lib/errors";
import {
  supportedSourceDocumentActions,
  toStableFailureCode,
  toStableAnomalyCode,
} from "@/application/contracts";

describe("target application contracts", () => {
  it("preserves an active result while a retry is anomalous or failed", () => {
    expect(supportedSourceDocumentActions({ activeRevisionId: "revision-1", pendingOutcome: "failed" }))
      .toEqual(["retry", "edit_retry", "manual_correction", "delete"]);
    expect(supportedSourceDocumentActions({ activeRevisionId: "revision-1", pendingOutcome: "processing" }))
      .toEqual(["delete"]);
  });

  it("offers accept/abandon actions when a completed candidate is pending", () => {
    expect(supportedSourceDocumentActions({ activeRevisionId: "revision-1", pendingOutcome: "completed" }))
      .toEqual(["accept_candidate", "abandon_candidate", "delete"]);
  });

  it("offers retry actions for first-parse completed with no active revision", () => {
    expect(supportedSourceDocumentActions({ activeRevisionId: null, pendingOutcome: "completed" }))
      .toEqual(["retry", "edit_retry", "delete"]);
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

  describe("toStableFailureCode", () => {
    it("returns processing_unavailable for null or undefined input", () => {
      expect(toStableFailureCode(null)).toBe("processing_unavailable");
      expect(toStableFailureCode(undefined)).toBe("processing_unavailable");
    });

    it("passes through known stable failure codes unchanged", () => {
      expect(toStableFailureCode("ai_provider_unavailable")).toBe("ai_provider_unavailable");
      expect(toStableFailureCode("ai_schema_invalid")).toBe("ai_schema_invalid");
      expect(toStableFailureCode("exchange_rate_failure")).toBe("exchange_rate_failure");
      expect(toStableFailureCode("storage_failure")).toBe("storage_failure");
      expect(toStableFailureCode("database_unavailable")).toBe("database_unavailable");
    });

    it("maps INTERNAL and VALIDATION_FAILED to ai_schema_invalid", () => {
      expect(toStableFailureCode("INTERNAL")).toBe("ai_schema_invalid");
      expect(toStableFailureCode("VALIDATION_FAILED")).toBe("ai_schema_invalid");
    });

    it("maps RATE_LIMITED to ai_provider_unavailable", () => {
      expect(toStableFailureCode("RATE_LIMITED")).toBe("ai_provider_unavailable");
    });

    it("maps STORAGE_UNAVAILABLE to storage_failure", () => {
      expect(toStableFailureCode("STORAGE_UNAVAILABLE")).toBe("storage_failure");
    });

    it("maps NOT_FOUND and CONFLICT to database_unavailable", () => {
      expect(toStableFailureCode("NOT_FOUND")).toBe("database_unavailable");
      expect(toStableFailureCode("CONFLICT")).toBe("database_unavailable");
    });

    it("maps unknown codes to processing_unavailable", () => {
      expect(toStableFailureCode("SOME_UNKNOWN_CODE")).toBe("processing_unavailable");
      expect(toStableFailureCode("")).toBe("processing_unavailable");
    });
  });

  describe("toStableAnomalyCode", () => {
    it("returns insufficient_evidence for null or undefined input", () => {
      expect(toStableAnomalyCode(null)).toBe("insufficient_evidence");
      expect(toStableAnomalyCode(undefined)).toBe("insufficient_evidence");
    });

    it("passes through known stable anomaly codes unchanged", () => {
      expect(toStableAnomalyCode("insufficient_evidence")).toBe("insufficient_evidence");
      expect(toStableAnomalyCode("currency_required")).toBe("currency_required");
      expect(toStableAnomalyCode("amount_conflict")).toBe("amount_conflict");
      expect(toStableAnomalyCode("unsupported_document")).toBe("unsupported_document");
    });

    it("maps legacy currency-related reasons to currency_required", () => {
      expect(toStableAnomalyCode("unknown_currency")).toBe("currency_required");
      expect(toStableAnomalyCode("Currency not recognized")).toBe("currency_required");
    });

    it("maps legacy amount/conflict reasons to amount_conflict", () => {
      expect(toStableAnomalyCode("amount_conflict")).toBe("amount_conflict");
      expect(toStableAnomalyCode("Parsing results diverged")).toBe("amount_conflict");
      expect(toStableAnomalyCode("Conflict detected in amounts")).toBe("amount_conflict");
    });

    it("maps legacy invalid/unsupported reasons to unsupported_document", () => {
      expect(toStableAnomalyCode("Invalid content")).toBe("unsupported_document");
      expect(toStableAnomalyCode("unsupported document type")).toBe("unsupported_document");
      expect(toStableAnomalyCode("Unrecognized format")).toBe("unsupported_document");
    });

    it("maps legacy evidence/content reasons to insufficient_evidence", () => {
      expect(toStableAnomalyCode("No valid entries")).toBe("insufficient_evidence");
      expect(toStableAnomalyCode("Evidence anomaly")).toBe("insufficient_evidence");
    });

    it("maps unknown reasons to insufficient_evidence", () => {
      expect(toStableAnomalyCode("Some unknown reason")).toBe("insufficient_evidence");
      expect(toStableAnomalyCode("")).toBe("insufficient_evidence");
    });
  });
});
