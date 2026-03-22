import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type * as PersistenceModule from "@/persistence";
import type * as DrizzleOrmModule from "drizzle-orm";

const {
  sourceDocumentsFindFirstMock,
  requireLedgerAccessMock,
  extractKeyFromUrlMock,
  getLocalStorageMock,
} = vi.hoisted(() => ({
  sourceDocumentsFindFirstMock: vi.fn(),
  requireLedgerAccessMock: vi.fn(),
  extractKeyFromUrlMock: vi.fn(),
  getLocalStorageMock: vi.fn(),
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
      ledgerId: "sourceDocuments.ledgerId",
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

vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: getLocalStorageMock,
}));

import { canAccessSourceDocumentUploadQuery } from "../../../../../../src/modules/source-document/application/queries/can-access-source-document-upload";

describe("canAccessSourceDocumentUploadQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalStorageMock.mockReturnValue({
      extractKeyFromUrl: extractKeyFromUrlMock,
    });
  });

  it("returns false when ledger access is denied", async () => {
    requireLedgerAccessMock.mockRejectedValueOnce(new AppError("Forbidden", "FORBIDDEN", 403));

    const result = await canAccessSourceDocumentUploadQuery("ledger-1", "doc-1", "key-1");

    expect(result).toBe(false);
    expect(sourceDocumentsFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns true when the storage key is referenced by the document", async () => {
    requireLedgerAccessMock.mockResolvedValueOnce({ ledger: { id: "ledger-1" } });
    sourceDocumentsFindFirstMock.mockResolvedValueOnce({
      imageUrls: ["https://example.com/ledger-1/doc-1/receipt.jpg"],
      metadata: {
        originalImageUrls: ["https://example.com/ledger-1/doc-1/original.jpg"],
      },
    });
    extractKeyFromUrlMock.mockImplementation((url: string) => {
      const prefix = "https://example.com/";
      return url.startsWith(prefix) ? url.slice(prefix.length) : null;
    });

    const result = await canAccessSourceDocumentUploadQuery(
      "ledger-1",
      "doc-1",
      "ledger-1/doc-1/original.jpg"
    );

    expect(result).toBe(true);
  });
});
