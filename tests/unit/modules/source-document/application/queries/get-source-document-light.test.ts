import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { getSourceDocumentLight } from "@/modules/source-document/application/queries/get-source-document-light";

describe("getSourceDocumentLight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireLedgerAccessMock.mockResolvedValue({ ledger: { id: "ledger-1" } });
    listLedgerEntryViewsBySourceDocumentIdsMock.mockResolvedValue(new Map());
  });

  it("returns a light payload without imageUrls and sensitive metadata fields", async () => {
    sourceDocumentsFindFirstMock
      .mockResolvedValueOnce({
        ledgerId: "ledger-1",
        imageUrls: ["https://example.com/receipt.jpg"],
      })
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
        metadata: {
          visionDescription: "secret",
          originalImageUrls: ["https://example.com/original.jpg"],
          note: "keep",
        },
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
        updatedAt: new Date("2026-03-20T11:00:00.000Z"),
        deletedAt: null,
      });

    const result = await getSourceDocumentLight("doc-1");

    expect(result).not.toBeNull();
    expect(result?.hasImages).toBe(true);
    expect((result as { imageUrls?: string[] } | null)?.imageUrls).toBeUndefined();
    expect(result?.metadata).toEqual({ note: "keep" });
  });
});
