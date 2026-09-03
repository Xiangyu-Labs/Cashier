import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessContextMock, getTargetSourceDocumentMock, requireLedgerAccessMock } = vi.hoisted(
  () => ({
    getAccessContextMock: vi.fn(),
    getTargetSourceDocumentMock: vi.fn(),
    requireLedgerAccessMock: vi.fn(),
  })
);

import { getSourceDocumentLight } from "@/modules/source-document/application/queries/get-source-document-light";
import type { SourceDocumentQueryPorts } from "@/modules/source-document/application/ports";

const queryPorts = {
  documents: { getAccessContext: getAccessContextMock, get: getTargetSourceDocumentMock },
  ledgerReads: {},
} as unknown as SourceDocumentQueryPorts;
const getLight = (id: string) => getSourceDocumentLight(id, queryPorts, requireLedgerAccessMock);

describe("getSourceDocumentLight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireLedgerAccessMock.mockResolvedValue({ ledger: { id: "ledger-1" } });
    getAccessContextMock.mockResolvedValue({ ledgerId: "ledger-1", hasImages: true });
  });

  it("returns stored-file identities and entries without a legacy URL field", async () => {
    getTargetSourceDocumentMock.mockResolvedValue({
      id: "doc-1",
      ledgerId: "ledger-1",
      title: "Receipt",
      text: "Lunch",
      files: [{ id: "file-1", contentType: "image/png", byteSize: 10, originalFilename: null }],
      status: "completed",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: "2026-03-20",
      metadata: { note: "keep" },
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T11:00:00.000Z",
      deletedAt: null,
      hasImages: true,
      ledgerEntries: [{ id: "entry-1", itemName: "Lunch" }],
      supportedActions: ["retry"],
      errorCode: null,
    });

    const result = await getLight("doc-1");
    expect(result?.files.map((file) => file.id)).toEqual(["file-1"]);
    expect(result).not.toHaveProperty("imageUrls");
    expect(result).not.toHaveProperty("metadata");
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).not.toHaveProperty("deletedAt");
    expect(result?.ledgerEntries).toEqual([expect.objectContaining({ id: "entry-1" })]);
  });

  it("returns null without exposing hidden document existence", async () => {
    getAccessContextMock.mockResolvedValue(null);
    await expect(getLight("doc-1")).resolves.toBeNull();
    expect(requireLedgerAccessMock).not.toHaveBeenCalled();
  });
});
