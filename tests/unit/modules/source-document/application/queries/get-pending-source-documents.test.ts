import { beforeEach, describe, expect, it, vi } from "vitest";

const { querySourceDocumentPageMock } = vi.hoisted(() => ({
  querySourceDocumentPageMock: vi.fn(),
}));

vi.mock("@/modules/source-document/application/queries/list-source-document-page", () => ({
  querySourceDocumentPage: querySourceDocumentPageMock,
}));

import { getPendingSourceDocumentsQuery } from "@/modules/source-document/application/queries/get-pending-source-documents";
import type { SourceDocumentQueryPorts } from "@/modules/source-document/application/ports";

const pendingStats = {
  processingCount: 1,
  candidatePendingCount: 0,
  duplicatePendingCount: 1,
  anomalyCount: 1,
  failedCount: 1,
  cancelledCount: 1,
  total: 5,
};
const queryPorts = {
  documents: { pendingSummary: vi.fn().mockResolvedValue(pendingStats) },
} as unknown as SourceDocumentQueryPorts;

describe("getPendingSourceDocumentsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    querySourceDocumentPageMock.mockResolvedValue({
      items: [
        {
          id: "doc-processing",
          status: "processing",
          ledgerEntries: [],
        },
        {
          id: "doc-anomaly",
          status: "anomaly",
          ledgerEntries: [],
        },
        {
          id: "doc-failed",
          status: "failed",
          ledgerEntries: [],
        },
        {
          id: "doc-cancelled",
          status: "cancelled",
          ledgerEntries: [],
        },
        {
          id: "doc-duplicate",
          status: "duplicate_pending",
          ledgerEntries: [],
        },
      ],
      nextCursor: null,
    });
  });

  it("groups processing, duplicate, anomaly, failed, and cancelled documents", async () => {
    const result = await getPendingSourceDocumentsQuery("ledger-1", queryPorts, { limit: 20 });

    expect(querySourceDocumentPageMock).toHaveBeenCalledWith(
      "ledger-1",
      {
        status: "processing,candidate_pending,duplicate_pending,anomaly,failed,cancelled",
        includeLedgerEntries: true,
        limit: 20,
      },
      queryPorts
    );
    expect(result.groups.processing).toHaveLength(1);
    expect(result.groups.anomaly).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
    expect(result.groups.cancelled).toHaveLength(1);
    expect(result.groups.duplicate_pending).toHaveLength(1);
    expect(result.stats.cancelledCount).toBe(1);
    expect(result.stats.duplicatePendingCount).toBe(1);
    expect(result.stats.total).toBe(5);
  });
});
