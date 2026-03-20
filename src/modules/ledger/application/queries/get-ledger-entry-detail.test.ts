import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import { createCategoryData, createLedgerData, createLedgerEntryData, createSourceDocumentData } from "tests/helpers/factories";
import { entryCategories, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";

const requireLedgerAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));

import { getLedgerEntryDetail } from "./get-ledger-entry-detail";

describe("getLedgerEntryDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireLedgerAccessMock.mockResolvedValue({
      userId: "00000000-0000-0000-0000-000000000000",
      ledger: { id: "ledger-1" },
    });
  });

  it("returns null when the entry does not exist", async () => {
    await expect(getLedgerEntryDetail(crypto.randomUUID())).resolves.toBeNull();
  });

  it("maps app errors from ledger access to UnauthorizedError", async () => {
    const db = getTestDb();
    const ledger = createLedgerData();
    const sourceDocument = createSourceDocumentData(ledger.id);
    const entry = createLedgerEntryData(ledger.id, { sourceDocumentId: sourceDocument.id });

    await db.insert(ledgers).values(ledger);
    await db.insert(sourceDocuments).values(sourceDocument);
    await db.insert(ledgerEntries).values(entry);

    requireLedgerAccessMock.mockRejectedValueOnce(new ForbiddenError("denied"));

    await expect(getLedgerEntryDetail(entry.id)).rejects.toThrow(UnauthorizedError);
  });

  it("returns detail while stripping heavy source-document fields", async () => {
    const db = getTestDb();
    const ledger = createLedgerData();
    const category = createCategoryData(ledger.id);
    const sourceDocument = createSourceDocumentData(ledger.id, {
      imageUrls: ["https://example.com/a.png", "https://example.com/b.png"],
      metadata: {
        note: "keep-me",
        visionDescription: "remove-me",
        originalImageUrls: ["https://example.com/original.png"],
      },
    });
    const entry = createLedgerEntryData(ledger.id, {
      categoryId: category.id,
      sourceDocumentId: sourceDocument.id,
    });

    await db.insert(ledgers).values(ledger);
    await db.insert(entryCategories).values(category);
    await db.insert(sourceDocuments).values(sourceDocument);
    await db.insert(ledgerEntries).values(entry);

    const result = await getLedgerEntryDetail(entry.id);

    expect(requireLedgerAccessMock).toHaveBeenCalledWith(ledger.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(entry.id);
    expect(result?.category?.id).toBe(category.id);
    expect(result?.sourceDocument?.imageUrls).toEqual([]);
    expect(result?.sourceDocument?.hasImages).toBe(true);
    expect(result?.sourceDocument?.metadata).toEqual({ note: "keep-me" });
  });
});
