import { describe, it, expect, beforeEach, vi } from "vitest";
import { batchUpdateSourceDocumentsAction } from "@/modules/source-document/actions";
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
      await batchUpdateSourceDocumentsAction(ledgerData.id, {
        targets: [docData1, docData2].map((document) => ({
          sourceDocumentId: document.id,
          expectedVersion: 1,
        })),
        data: { title: "Updated documents" },
      });

      // Verify updates
      const updated1 = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData1.id),
      });
      const updated2 = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData2.id),
      });

      expect(updated1?.title).toBe("Updated documents");
      expect(updated2?.title).toBe("Updated documents");
    });

    it("recalculates active entry conversions using the new historical date", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({
        userId: testUserId,
        mainCurrency: "USD",
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
      await db
        .insert(currencyRates)
        .values({
          date: "2024-03-15",
          base: "EUR",
          rates: { EUR: 1, USD: 1, CNY: 10 },
        })
        .onConflictDoNothing();

      await batchUpdateSourceDocumentsAction(ledgerData.id, {
        targets: [{ sourceDocumentId: document.id, expectedVersion: 1 }],
        data: { entryDate: "2024-03-15" },
      });

      const [updatedDocument, updatedEntry] = await Promise.all([
        db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, document.id) }),
        db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, entryId) }),
      ]);
      expect(updatedDocument?.entryDate).toBe("2024-03-15");
      expect(updatedEntry?.convertedAmount).toBe("10.000");
      expect(updatedEntry?.exchangeRate).toBe("0.100000000000");
    });

    it("rejects an empty batch", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      await expect(
        batchUpdateSourceDocumentsAction(ledgerData.id, {
          targets: [],
          data: { title: "Ignored" },
        })
      ).rejects.toThrow();
    });

    it("treats an already-matching title as a no-op: zero writes, version unchanged", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);
      const docData = createSourceDocumentData(ledgerData.id, { title: "Same title" });
      await db.insert(sourceDocuments).values(docData);

      const result = await batchUpdateSourceDocumentsAction(ledgerData.id, {
        targets: [{ sourceDocumentId: docData.id, expectedVersion: 1 }],
        data: { title: "Same title" },
      });

      expect(result).toMatchObject({
        ok: true,
        versions: [{ sourceDocumentId: docData.id, version: 1 }],
        data: { updatedCount: 0 },
      });
      const document = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData.id),
      });
      expect(document?.stateVersion).toBe(1);
    });

    it("rolls back the whole batch — including the non-stale document — when one target is stale", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);
      const okDoc = createSourceDocumentData(ledgerData.id, { title: "Original A" });
      const staleDoc = createSourceDocumentData(ledgerData.id, { title: "Original B" });
      await db.insert(sourceDocuments).values([okDoc, staleDoc]);
      // Advance staleDoc's version out from under the caller's expectation.
      await db
        .update(sourceDocuments)
        .set({ stateVersion: 2 })
        .where(eq(sourceDocuments.id, staleDoc.id));

      const result = await batchUpdateSourceDocumentsAction(ledgerData.id, {
        targets: [
          { sourceDocumentId: okDoc.id, expectedVersion: 1 },
          { sourceDocumentId: staleDoc.id, expectedVersion: 1 },
        ],
        data: { title: "Batch title" },
      });

      expect(result).toMatchObject({
        ok: false,
        reason: "stale",
        staleTargets: [{ sourceDocumentId: staleDoc.id, expectedVersion: 1, currentVersion: 2 }],
      });
      // The non-stale document's write is rolled back too — atomic, not partial.
      const okDocument = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, okDoc.id),
      });
      expect(okDocument?.title).toBe("Original A");
      expect(okDocument?.stateVersion).toBe(1);
    });
  });
});
