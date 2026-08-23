import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  updateSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
} from "@/modules/source-document/actions";
import { getTestDb } from "../../setup";
import {
  currencyRates,
  duplicateReviews,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
  ledgers,
} from "@/persistence";
import { createLedgerData, createSourceDocumentData } from "../../helpers/factories";
import { eq } from "drizzle-orm";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";
import { postgresFxRateBook } from "@/application/adapters/postgres/exchange-rate";

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("Source Document Update Actions", () => {
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const historicalDate = "2024-03-15";

  async function seedHistoricalRate() {
    const db = getTestDb();
    await db
      .insert(currencyRates)
      .values({
        date: historicalDate,
        base: "EUR",
        rates: { EUR: 1, USD: 1, CNY: 10 },
      })
      .onConflictDoNothing();
  }

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

    it("returns only the business update result for each document kind", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      const processingDocument = createSourceDocumentData(ledgerData.id, {
        status: "processing",
      });
      const failedDocument = createSourceDocumentData(ledgerData.id, {
        status: "failed",
      });
      const manualDocument = createSourceDocumentData(ledgerData.id, {
        status: "completed",
        type: "manual",
      });
      const candidateDocument = createSourceDocumentData(ledgerData.id, {
        status: "completed",
      });
      await db
        .insert(sourceDocuments)
        .values([processingDocument, failedDocument, manualDocument, candidateDocument]);
      await Promise.all([
        activateTestSourceDocumentProjection(db, processingDocument.id),
        activateTestSourceDocumentProjection(db, failedDocument.id),
        activateTestSourceDocumentProjection(db, manualDocument.id),
        activateTestSourceDocumentProjection(db, candidateDocument.id),
      ]);
      const candidatePendingRevision = (
        await db
          .insert(sourceDocumentRevisions)
          .values({
            ledgerId: ledgerData.id,
            sourceDocumentId: candidateDocument.id,
            revisionNumber: 2,
            outcome: "completed",
            finalizedAt: new Date(),
          })
          .returning()
      )[0]!;
      await db
        .update(sourceDocuments)
        .set({ pendingRevisionId: candidatePendingRevision.id })
        .where(eq(sourceDocuments.id, candidateDocument.id));
      const [processingResult, failedResult, manualResult, candidateResult] = await Promise.all([
        updateSourceDocumentAction(
          ledgerData.id,
          processingDocument.id,
          { title: "Processing title" },
          crypto.randomUUID()
        ),
        updateSourceDocumentAction(
          ledgerData.id,
          failedDocument.id,
          { title: "Failed title" },
          crypto.randomUUID()
        ),
        updateSourceDocumentAction(
          ledgerData.id,
          manualDocument.id,
          { title: "Manual title" },
          crypto.randomUUID()
        ),
        updateSourceDocumentAction(
          ledgerData.id,
          candidateDocument.id,
          { title: "Candidate title" },
          crypto.randomUUID()
        ),
      ]);

      for (const result of [processingResult, failedResult, manualResult, candidateResult]) {
        expect(result).toMatchObject({ updated: true });
        expect(result).not.toHaveProperty("reconciliation");
      }
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

    it("recalculates an active AI projection for a single date update", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId, mainCurrency: "USD" });
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
        itemName: "AI item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      await activateTestSourceDocumentProjection(db, document.id);
      await seedHistoricalRate();

      await updateSourceDocumentAction(ledgerData.id, document.id, {
        entryDate: historicalDate,
      });

      const [updatedDocument, updatedEntry] = await Promise.all([
        db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, document.id) }),
        db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, entryId) }),
      ]);
      expect(updatedDocument?.entryDate).toBe(historicalDate);
      expect(updatedEntry?.convertedAmount).toBe("10.000");
      expect(updatedEntry?.exchangeRate).toBe("0.100000000000");
    });

    it("recalculates an active manual projection while creating a new revision", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId, mainCurrency: "USD" });
      await db.insert(ledgers).values(ledgerData);
      const document = createSourceDocumentData(ledgerData.id, {
        status: "completed",
        type: "manual",
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
        itemName: "Manual item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      const initialRevisionId = await activateTestSourceDocumentProjection(db, document.id);
      await seedHistoricalRate();

      await updateSourceDocumentAction(ledgerData.id, document.id, {
        entryDate: historicalDate,
      });

      const updatedDocument = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, document.id),
      });
      const updatedEntry = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, entryId),
      });
      expect(updatedDocument?.entryDate).toBe(historicalDate);
      expect(updatedDocument?.activeRevisionId).not.toBe(initialRevisionId);
      expect(updatedEntry?.sourceDocumentRevisionId).toBe(updatedDocument?.activeRevisionId);
      expect(updatedEntry?.convertedAmount).toBe("10.000");
      expect(updatedEntry?.exchangeRate).toBe("0.100000000000");
    });

    it("rejects date updates while a candidate projection is pending", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId, mainCurrency: "USD" });
      await db.insert(ledgers).values(ledgerData);
      const document = createSourceDocumentData(ledgerData.id, {
        status: "completed",
        entryDate: "2024-03-14",
      });
      await db.insert(sourceDocuments).values(document);
      const activeEntryId = crypto.randomUUID();
      await db.insert(ledgerEntries).values({
        id: activeEntryId,
        ledgerId: ledgerData.id,
        sourceDocumentId: document.id,
        amount: "100",
        currency: "CNY",
        itemName: "Active item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      const activeRevisionId = await activateTestSourceDocumentProjection(db, document.id);
      const pendingRevision = (
        await db
          .insert(sourceDocumentRevisions)
          .values({
            ledgerId: ledgerData.id,
            sourceDocumentId: document.id,
            revisionNumber: 2,
            outcome: "completed",
            finalizedAt: new Date(),
          })
          .returning()
      )[0]!;
      const pendingEntryId = crypto.randomUUID();
      await db.insert(ledgerEntries).values({
        id: pendingEntryId,
        ledgerId: ledgerData.id,
        sourceDocumentId: document.id,
        sourceDocumentRevisionId: pendingRevision.id,
        amount: "100",
        currency: "CNY",
        itemName: "Candidate item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      await db
        .update(sourceDocuments)
        .set({ activeRevisionId, pendingRevisionId: pendingRevision.id })
        .where(eq(sourceDocuments.id, document.id));
      await seedHistoricalRate();

      await expect(
        updateSourceDocumentAction(ledgerData.id, document.id, {
          entryDate: historicalDate,
        })
      ).rejects.toThrow("processing work");

      const updatedEntries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.sourceDocumentId, document.id));
      const currentEntries = updatedEntries.filter((entry) => entry.deletedAt == null);
      expect(currentEntries).toHaveLength(2);
      expect(currentEntries.map((entry) => entry.id).sort()).toEqual(
        [activeEntryId, pendingEntryId].sort()
      );
      expect(currentEntries.every((entry) => entry.convertedAmount === "20.000")).toBe(true);
      expect(currentEntries.every((entry) => entry.exchangeRate === "0.200000000000")).toBe(true);
    });

    it("rejects date updates while duplicate review is pending", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId, mainCurrency: "USD" });
      await db.insert(ledgers).values(ledgerData);
      const document = createSourceDocumentData(ledgerData.id, {
        status: "completed",
        entryDate: "2024-03-14",
      });
      const matchedDocument = createSourceDocumentData(ledgerData.id, {
        status: "completed",
      });
      await db.insert(sourceDocuments).values([document, matchedDocument]);
      const entryId = crypto.randomUUID();
      await db.insert(ledgerEntries).values({
        id: entryId,
        ledgerId: ledgerData.id,
        sourceDocumentId: document.id,
        amount: "100",
        currency: "CNY",
        itemName: "Duplicate item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      const activeRevisionId = await activateTestSourceDocumentProjection(db, document.id);
      const matchedRevisionId = await activateTestSourceDocumentProjection(db, matchedDocument.id);
      await db.insert(duplicateReviews).values({
        ledgerId: ledgerData.id,
        sourceDocumentId: document.id,
        revisionId: activeRevisionId,
        matchedSourceDocumentId: matchedDocument.id,
        matchedRevisionId,
        matchedTitle: "Matched original",
        matchedEntryDate: "2024-03-14",
        matchedCreatedAt: new Date("2024-03-14T08:00:00.000Z"),
        status: "pending",
      });
      await db
        .update(sourceDocuments)
        .set({ currentStatus: "duplicate_pending" })
        .where(eq(sourceDocuments.id, document.id));
      await seedHistoricalRate();

      await expect(
        updateSourceDocumentAction(ledgerData.id, document.id, {
          entryDate: historicalDate,
        })
      ).rejects.toThrow("pending duplicate review");

      const [updatedDocument, updatedEntry] = await Promise.all([
        db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, document.id) }),
        db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, entryId) }),
      ]);
      expect(updatedDocument?.currentStatus).toBe("duplicate_pending");
      expect(updatedDocument?.entryDate).toBe("2024-03-14");
      expect(updatedEntry?.convertedAmount).toBe("20.000");
      expect(updatedEntry?.exchangeRate).toBe("0.200000000000");
    });

    it("does not change the date or projection when FX conversion fails", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId, mainCurrency: "USD" });
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
        itemName: "FX failure item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      await activateTestSourceDocumentProjection(db, document.id);
      const conversionSpy = vi
        .spyOn(postgresFxRateBook, "convertBatch")
        .mockRejectedValueOnce(new Error("provider unavailable"));

      try {
        await expect(
          updateSourceDocumentAction(ledgerData.id, document.id, {
            entryDate: historicalDate,
          })
        ).rejects.toThrow("provider unavailable");
      } finally {
        conversionSpy.mockRestore();
      }

      const [updatedDocument, updatedEntry] = await Promise.all([
        db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, document.id) }),
        db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, entryId) }),
      ]);
      expect(updatedDocument?.entryDate).toBe("2024-03-14");
      expect(updatedEntry?.convertedAmount).toBe("20.000");
      expect(updatedEntry?.exchangeRate).toBe("0.200000000000");
    });

    it("rejects a concurrent projection change before committing the date", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId, mainCurrency: "USD" });
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
        itemName: "Concurrent item",
        convertedAmount: "20",
        exchangeRate: "0.2",
      });
      await activateTestSourceDocumentProjection(db, document.id);

      let resolveConversion!: (
        value: Array<{ convertedAmount: string; exchangeRate: string }>
      ) => void;
      const conversionPromise = new Promise<
        Array<{ convertedAmount: string; exchangeRate: string }>
      >((resolve) => {
        resolveConversion = resolve;
      });
      const conversionSpy = vi
        .spyOn(postgresFxRateBook, "convertBatch")
        .mockReturnValueOnce(conversionPromise);
      const updatePromise = updateSourceDocumentAction(ledgerData.id, document.id, {
        entryDate: historicalDate,
      });

      await vi.waitFor(() => expect(conversionSpy).toHaveBeenCalledTimes(1));
      await db.update(ledgerEntries).set({ amount: "101" }).where(eq(ledgerEntries.id, entryId));
      resolveConversion([{ convertedAmount: "10", exchangeRate: "0.1" }]);

      try {
        await expect(updatePromise).rejects.toThrow("Ledger entries changed");
      } finally {
        conversionSpy.mockRestore();
      }

      const [updatedDocument, updatedEntry] = await Promise.all([
        db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, document.id) }),
        db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, entryId) }),
      ]);
      expect(updatedDocument?.entryDate).toBe("2024-03-14");
      expect(updatedEntry?.amount).toBe("101.000");
      expect(updatedEntry?.convertedAmount).toBe("20.000");
      expect(updatedEntry?.exchangeRate).toBe("0.200000000000");
    });

    it("should not throw when document does not exist", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      // Should not throw when document doesn't exist
      await expect(
        updateSourceDocumentAction(ledgerData.id, "00000000-0000-4000-8000-000000000099", {
          title: "Updated Title",
        })
      ).resolves.toEqual({
        sourceDocumentId: "00000000-0000-4000-8000-000000000099",
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
        title: "Updated documents",
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

      await batchUpdateSourceDocumentsAction(ledgerData.id, [document.id], {
        entryDate: "2024-03-15",
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
        batchUpdateSourceDocumentsAction(ledgerData.id, [], {
          title: "Ignored",
        })
      ).rejects.toThrow();
    });
  });
});
