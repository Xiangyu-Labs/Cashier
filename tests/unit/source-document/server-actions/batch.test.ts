import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  requireLedgerAccessMock,
  deleteSourceDocumentMock,
  retrySourceDocumentMock,
  scheduleProcessingAfterMock,
} = vi.hoisted(() => ({
  requireLedgerAccessMock: vi.fn(),
  deleteSourceDocumentMock: vi.fn(),
  retrySourceDocumentMock: vi.fn(),
  scheduleProcessingAfterMock: vi.fn(),
}));

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));

vi.mock("@/modules/source-document/application/use-cases/delete-source-document", () => ({
  deleteSourceDocument: deleteSourceDocumentMock,
}));

vi.mock("@/modules/source-document/application/use-cases/retry-source-document", () => ({
  retrySourceDocument: retrySourceDocumentMock,
}));

vi.mock("@/modules/source-document/server-actions/schedule-processing", () => ({
  scheduleProcessingAfter: scheduleProcessingAfterMock,
}));

vi.mock("@/application/server-composition-root", () => ({
  serverComposition: {
    sourceDocumentRevisions: {},
    sourceDocumentSubmissions: {},
  },
}));

import {
  batchDeleteSourceDocumentsAction,
  batchRetrySourceDocumentsAction,
} from "@/modules/source-document/server-actions/batch";

const ledgerId = "00000000-0000-4000-8000-000000000001";
const sourceDocumentId = "00000000-0000-4000-8000-000000000002";

describe("source document batch server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireLedgerAccessMock.mockResolvedValue({ ledger: { id: ledgerId } });
  });

  it("returns a stable internal reason without exposing the original error", async () => {
    deleteSourceDocumentMock.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await batchDeleteSourceDocumentsAction(ledgerId, [sourceDocumentId]);

    expect(result).toEqual({
      requestedCount: 1,
      succeededIds: [],
      skipped: [],
      failed: [{ id: sourceDocumentId, reason: "internal" }],
    });
    expect(JSON.stringify(result)).not.toContain("database unavailable");
  });

  it("classifies infrastructure AppErrors as processing_unavailable", async () => {
    retrySourceDocumentMock.mockRejectedValueOnce(
      new AppError("storage provider unavailable", "STORAGE_UNAVAILABLE")
    );

    const result = await batchRetrySourceDocumentsAction(ledgerId, [sourceDocumentId]);

    expect(result.failed).toEqual([{ id: sourceDocumentId, reason: "processing_unavailable" }]);
    expect(JSON.stringify(result)).not.toContain("storage provider unavailable");
  });
});
