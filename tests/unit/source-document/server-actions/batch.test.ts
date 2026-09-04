import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  requireLedgerAccessMock,
  deleteSourceDocumentMock,
  retrySourceDocumentMock,
  scheduleProcessingAfterMock,
  deleteDocumentsMock,
} = vi.hoisted(() => ({
  requireLedgerAccessMock: vi.fn(),
  deleteSourceDocumentMock: vi.fn(),
  retrySourceDocumentMock: vi.fn(),
  scheduleProcessingAfterMock: vi.fn(),
  deleteDocumentsMock: vi.fn(),
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
    sourceDocumentAggregate: { deleteDocuments: deleteDocumentsMock },
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
    deleteDocumentsMock.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await batchDeleteSourceDocumentsAction(ledgerId, [
      { sourceDocumentId, expectedVersion: 1 },
    ]);

    expect(result).toEqual({
      succeeded: [],
      stale: [],
      failed: [{ id: sourceDocumentId, code: "INTERNAL" }],
    });
    expect(JSON.stringify(result)).not.toContain("database unavailable");
  });

  it("classifies infrastructure AppErrors as processing_unavailable", async () => {
    retrySourceDocumentMock.mockRejectedValueOnce(
      new AppError("storage provider unavailable", "STORAGE_UNAVAILABLE")
    );

    const result = await batchRetrySourceDocumentsAction(ledgerId, [
      { sourceDocumentId, expectedVersion: 1 },
    ]);

    expect(result.failed).toEqual([{ id: sourceDocumentId, code: "PROCESSING_UNAVAILABLE" }]);
    expect(JSON.stringify(result)).not.toContain("storage provider unavailable");
  });
});
