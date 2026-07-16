import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  getAccessContextMock,
  getTargetSourceDocumentMock,
  requireLedgerAccessMock,
  listLedgerEntryViewsBySourceDocumentIdsMock,
} = vi.hoisted(() => ({
  getAccessContextMock: vi.fn(),
  getTargetSourceDocumentMock: vi.fn(),
  requireLedgerAccessMock: vi.fn(),
  listLedgerEntryViewsBySourceDocumentIdsMock: vi.fn(),
}));

vi.mock("@/application/current", () => ({
  currentApplication: {
    sourceDocumentReads: {
      getAccessContext: getAccessContextMock,
      get: getTargetSourceDocumentMock,
    },
  },
}));
vi.mock("@/modules/ledger/access", () => ({ requireLedgerAccess: requireLedgerAccessMock }));
vi.mock("@/modules/ledger/source-document-queries", () => ({
  listLedgerEntryViewsBySourceDocumentIds: listLedgerEntryViewsBySourceDocumentIdsMock,
}));

import { getSourceDocumentDetail } from "@/modules/source-document/application/queries/get-source-document-detail";

describe("getSourceDocumentDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccessContextMock.mockResolvedValue({ ledgerId: "ledger-1", hasImages: false });
    requireLedgerAccessMock.mockResolvedValue({ ledger: { id: "ledger-1" } });
    listLedgerEntryViewsBySourceDocumentIdsMock.mockResolvedValue(new Map());
    getTargetSourceDocumentMock.mockResolvedValue({
      id: "doc-1",
      ledgerId: "ledger-1",
      files: [],
      createdAt: "2026-03-20T10:00:00.000Z",
    });
  });

  it("returns the authorized target document", async () => {
    const result = await getSourceDocumentDetail("doc-1");
    expect(result?.id).toBe("doc-1");
    expect(requireLedgerAccessMock).toHaveBeenCalledWith("ledger-1");
  });

  it("returns null when access is denied", async () => {
    requireLedgerAccessMock.mockRejectedValue(new AppError("Forbidden", "FORBIDDEN", 403));
    await expect(getSourceDocumentDetail("doc-1")).resolves.toBeNull();
    expect(getTargetSourceDocumentMock).not.toHaveBeenCalled();
  });

  it("returns null for a hidden document", async () => {
    getAccessContextMock.mockResolvedValue(null);
    await expect(getSourceDocumentDetail("doc-1")).resolves.toBeNull();
  });
});
