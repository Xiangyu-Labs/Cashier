import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type * as PersistenceModule from "@/persistence";
import type * as DrizzleOrmModule from "drizzle-orm";

const {
  sourceDocumentsFindFirstMock,
  requireLedgerAccessMock,
  listLedgerEntryViewsBySourceDocumentIdsMock,
} = vi.hoisted(() => ({
  sourceDocumentsFindFirstMock: vi.fn(),
  requireLedgerAccessMock: vi.fn(),
  listLedgerEntryViewsBySourceDocumentIdsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      sourceDocuments: {
        findFirst: sourceDocumentsFindFirstMock,
      },
    },
  },
}));

vi.mock("@/persistence", async () => {
  const actual = await vi.importActual<typeof PersistenceModule>("@/persistence");
  return {
    ...actual,
    sourceDocuments: {
      id: "sourceDocuments.id",
      deletedAt: "sourceDocuments.deletedAt",
    },
  };
});

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof DrizzleOrmModule>("drizzle-orm");
  return {
    ...actual,
    and: vi.fn((...parts: unknown[]) => ({ and: parts })),
    eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
    isNull: vi.fn((column: unknown) => ({ isNull: column })),
  };
});

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));

vi.mock("@/modules/ledger/source-document-queries", () => ({
  listLedgerEntryViewsBySourceDocumentIds: listLedgerEntryViewsBySourceDocumentIdsMock,
}));

import { getSourceDocumentDetail } from "@/modules/source-document/application/queries/get-source-document-detail";

describe("getSourceDocumentDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLedgerEntryViewsBySourceDocumentIdsMock.mockResolvedValue(new Map());
  });

  it("returns a serialized source document when access is granted", async () => {
    sourceDocumentsFindFirstMock
      .mockResolvedValueOnce({ ledgerId: "ledger-1" })
      .mockResolvedValueOnce({
        id: "doc-1",
        ledgerId: "ledger-1",
        title: "Receipt",
        text: "Lunch",
        imageUrls: ["https://example.com/receipt.jpg"],
        status: "completed",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: "2026-03-20",
        metadata: { note: "keep" },
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        updatedAt: new Date("2026-03-20T11:00:00.000Z"),
        deletedAt: null,
      });
    requireLedgerAccessMock.mockResolvedValue({ ledger: { id: "ledger-1" } });

    const result = await getSourceDocumentDetail("doc-1");

    expect(requireLedgerAccessMock).toHaveBeenCalledWith("ledger-1");
    expect(listLedgerEntryViewsBySourceDocumentIdsMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      sourceDocumentIds: ["doc-1"],
    });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("doc-1");
    expect(result?.ledgerId).toBe("ledger-1");
    expect(result?.createdAt).toBe("2026-03-20T10:00:00.000Z");
  });

  it("returns null and avoids leaking document existence when access is denied", async () => {
    sourceDocumentsFindFirstMock.mockResolvedValueOnce({ ledgerId: "ledger-1" });
    requireLedgerAccessMock.mockRejectedValueOnce(new AppError("Forbidden", "FORBIDDEN", 403));

    const result = await getSourceDocumentDetail("doc-1");

    expect(result).toBeNull();
    expect(sourceDocumentsFindFirstMock).toHaveBeenCalledTimes(1);
    expect(listLedgerEntryViewsBySourceDocumentIdsMock).not.toHaveBeenCalled();
  });
});
