import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  updateSourceDocumentAction,
  updateSourceDocumentImagesAction,
  batchUpdateSourceDocumentsAction,
} from "@/modules/source-document/actions";
import { getTestDb } from "../../setup";
import { sourceDocuments, ledgers } from "@/persistence";
import { createLedgerData, createSourceDocumentData } from "../../helpers/factories";
import { eq } from "drizzle-orm";

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
      ).resolves.not.toThrow();
    });
  });

  describe("updateSourceDocumentImagesAction", () => {
    it("should replace current imageUrls and preserve original image urls in metadata", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      const docData = createSourceDocumentData(ledgerData.id, {
        imageUrls: ["https://example.com/original.jpg"],
        metadata: {},
      });
      await db.insert(sourceDocuments).values(docData);

      await updateSourceDocumentImagesAction(ledgerData.id, docData.id, [
        { data: "data:image/jpeg;base64,/9j/4AAQ", mimeType: "image/jpeg" },
      ]);

      const updated = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData.id),
      });

      expect(updated?.imageUrls ?? []).toHaveLength(1);
      expect(updated?.imageUrls?.[0]).toMatch(/^\/api\/uploads\//);
      expect(updated?.metadata).toEqual({
        originalImageUrls: ["https://example.com/original.jpg"],
      });
    });

    it("should keep the earliest original image backup when editing again", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      const docData = createSourceDocumentData(ledgerData.id, {
        imageUrls: ["/api/uploads/current-edited.jpg"],
        metadata: {
          originalImageUrls: ["https://example.com/first-original.jpg"],
        },
      });
      await db.insert(sourceDocuments).values(docData);

      await updateSourceDocumentImagesAction(ledgerData.id, docData.id, [
        { data: "data:image/jpeg;base64,/9j/4AAQ", mimeType: "image/jpeg" },
      ]);

      const updated = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, docData.id),
      });

      expect(updated?.metadata).toEqual({
        originalImageUrls: ["https://example.com/first-original.jpg"],
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

    it("should not execute update when empty array is passed", async () => {
      const db = getTestDb();
      const ledgerData = createLedgerData({ userId: testUserId });
      await db.insert(ledgers).values(ledgerData);

      await expect(
        batchUpdateSourceDocumentsAction(ledgerData.id, [], {
          status: "completed",
        })
      ).resolves.not.toThrow();
    });
  });
});
