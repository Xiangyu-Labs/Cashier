import { beforeEach, describe, expect, it, vi } from "vitest";

const { querySourceDocumentPageMock } = vi.hoisted(() => ({
  querySourceDocumentPageMock: vi.fn(),
}));

vi.mock("@/modules/source-document/application/queries/list-source-document-page", () => ({
  querySourceDocumentPage: querySourceDocumentPageMock,
}));

import { getPendingSourceDocumentsQuery } from "@/modules/source-document/application/queries/get-pending-source-documents";

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
      ],
      nextCursor: null,
    });
  });

  it("groups processing, anomaly, and failed documents", async () => {
    const result = await getPendingSourceDocumentsQuery("ledger-1");

    expect(querySourceDocumentPageMock).toHaveBeenCalledWith("ledger-1", {
      status: "processing,anomaly,failed",
      includeLedgerEntries: true,
    });
    expect(result.groups.processing).toHaveLength(1);
    expect(result.groups.anomaly).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
    expect(result.stats.total).toBe(3);
  });
});
