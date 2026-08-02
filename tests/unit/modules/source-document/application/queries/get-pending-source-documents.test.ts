import { beforeEach, describe, expect, it, vi } from "vitest";

const { querySourceDocumentPageMock } = vi.hoisted(() => ({
  querySourceDocumentPageMock: vi.fn(),
}));

vi.mock("@/modules/source-document/application/queries/list-source-document-page", () => ({
  querySourceDocumentPage: querySourceDocumentPageMock,
}));

import { getPendingSourceDocumentsQuery } from "@/modules/source-document/application/queries/get-pending-source-documents";
import type { SourceDocumentQueryPorts } from "@/modules/source-document/application/ports";

const queryPorts = {} as SourceDocumentQueryPorts;

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
      ],
      nextCursor: null,
    });
  });

  it("groups processing, anomaly, failed, and cancelled documents", async () => {
    const result = await getPendingSourceDocumentsQuery("ledger-1", queryPorts);

    expect(querySourceDocumentPageMock).toHaveBeenCalledWith(
      "ledger-1",
      {
        status: "processing,anomaly,failed,cancelled",
        includeLedgerEntries: true,
      },
      queryPorts
    );
    expect(result.groups.processing).toHaveLength(1);
    expect(result.groups.anomaly).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
    expect(result.groups.cancelled).toHaveLength(1);
    expect(result.stats.cancelledCount).toBe(1);
    expect(result.stats.total).toBe(4);
  });
});
