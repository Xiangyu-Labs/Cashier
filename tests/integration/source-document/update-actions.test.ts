import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  updateSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
} from "@/modules/source-document/actions";
import { getTestDb } from "../../setup";
import { currencyRates, ledgerEntries, sourceDocuments, ledgers } from "@/persistence";
import { createLedgerData, createSourceDocumentData } from "../../helpers/factories";
import { eq } from "drizzle-orm";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("Source Document Update Actions", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: testUserId, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  describe("updateSourceDocumentAction", () => {
    it("should update source document title", async () => {
      const db = getTestDb();
      // Create ledger
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      // Create source document
      const docData = createSourceDocumentData(ledgerData.id);
      await db.insert(sourceDocuments).values(docData);

      // Update the document
      await updateSourceDocumentAction(ledgerData.id, docData.id, {
        title: "Updated Title",
      });

      // Verify the update
      const updated = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData.id),
      });

      expect(updated?.title).toBe("Updated Title");
    });

    it("should update source document entry date", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      const docData = createSourceDocumentData(ledgerData.id);
      await db.insert(sourceDocuments).values(docData);

      await updateSourceDocumentAction(ledgerData.id, docData.id, {
        entryDate: "2024-03-15",
      });

      const updated = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData.id),
      });

      expect(updated?.entryDate).toBe("2024-03-15");
    });

    it("should not throw when document does not exist", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      // Should not throw when document doesn't exist
      await expect(
        updateSourceDocumentAction(ledgerData.id, "non-existent-id", {
          title: "Updated Title",
        })
      ).resolves.toEqual({
        sourceDocumentId: "non-existent-id",
        updated: false,
      });
    });
  });

  describe("batchUpdateSourceDocumentsAction", () => {
    it("should batch update multiple source documents", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      // Create multiple documents
      const docData1 = createSourceDocumentData(ledgerData.id);
      const docData2 = createSourceDocumentData(ledgerData.id);
      await db.insert(sourceDocuments).values([docData1, docData2]);

      // Batch update
      await batchUpdateSourceDocumentsAction(ledgerData.id, [docData1.id, docData2.id], {
        status: "completed",
      });

      // Verify updates
      const updated1 = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData1.id),
      });
      const updated2 = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData2.id),
      });

      expect(updated1?.status).toBe("completed");
      expect(updated2?.status).toBe("completed");
    });

    it("recalculates active entry conversions using the new historical date", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({
        userId: testUserId,
        metadata: { settings: { mainCurrency: "USD" } },
      });
      await db.insert(ledgers).values(ledgerData);
      const document = createSourceDocumentData(ledgerData.id, {
        status: "completed",
        entryDate: "2024-03-14",
      });
      await db.insert(sourceDocuments).values(document);
      const entryId = crypto.randomUUID();
      await db.insert(ledgerEntries).values({
        id: entryId,
        ledgerId: ledgerData.id,
        sourceDocumentId: document.id,
        amount: "100",
        currency: "CNY",
        itemName: "Historical item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      await activateTestSourceDocumentProjection(db, document.id);
      await db.insert(currencyRates).values({
        date: "2024-03-15",
        base: "EUR",
        rates: { EUR: 1, USD: 1, CNY: 10 },
      }).onConflictDoNothing();

      await batchUpdateSourceDocumentsAction(ledgerData.id, [document.id], {
        entryDate: "2024-03-15",
      });

      const [updatedDocument, updatedEntry] = await Promise.all([
        db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, document.id) }),
        db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, entryId) }),
      ]);
      expect(updatedDocument?.entryDate).toBe("2024-03-15");
      expect(updatedEntry?.convertedAmount).toBe("10.00");
      expect(updatedEntry?.exchangeRate).toBe("0.100000");
    });

    it("rejects an empty batch", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      await expect(
        batchUpdateSourceDocumentsAction(ledgerData.id, [], {
          status: "completed",
        })
      ).rejects.toThrow();
    });
  });
});
