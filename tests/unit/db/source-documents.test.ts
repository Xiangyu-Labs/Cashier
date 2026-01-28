import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { ledgers, sourceDocuments } from "@/lib/db/schema";

describe("SourceDocuments Database Operations", () => {
  describe("CREATE", () => {
    it("should create a text input message", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: ledger.id,
          text: "午餐花了25.5元",
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.text).toBe("午餐花了25.5元");
      expect(created.imageUrls).toEqual([]);
    });

    it("should create an image input message", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const imageUrl = "data:image/jpeg;base64,fake...";

      const [created] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: ledger.id,
          imageUrls: [imageUrl],
        })
        .returning();

      expect(created.text).toBeNull();
      expect(created.imageUrls).toHaveLength(1);
      expect(created.imageUrls![0]).toBe(imageUrl);
    });
  });

  describe("READ", () => {
    it("should find source documents by ledger id", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(sourceDocuments).values([
        { ledgerId: ledger.id, text: "Message 1" },
        { ledgerId: ledger.id, text: "Message 2" },
      ]);

      const found = await db.query.sourceDocuments.findMany({
        where: eq(sourceDocuments.ledgerId, ledger.id),
      });

      expect(found).toHaveLength(2);
    });

    it("should find source document with ledger relation", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Parent Ledger" })
        .returning();

      const [message] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: ledger.id,
          text: "Test message",
        })
        .returning();

      const found = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, message.id),
        with: { ledger: true },
      });

      expect(found?.ledger).toBeDefined();
      expect(found?.ledger.name).toBe("Parent Ledger");
    });
  });

  describe("DELETE", () => {
    it("should delete source document", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      const [created] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId: ledger.id,
          text: "To delete",
        })
        .returning();

      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, created.id));

      const found = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, created.id),
      });

      expect(found).toBeUndefined();
    });

    it("should cascade delete source documents when ledger is deleted", async () => {
      const db = getTestDb();
      const [ledger] = await db
        .insert(ledgers)
        .values({ name: "Test Ledger" })
        .returning();

      await db.insert(sourceDocuments).values({
        ledgerId: ledger.id,
        text: "Will be deleted",
      });

      await db.delete(ledgers).where(eq(ledgers.id, ledger.id));

      const orphaned = await db.query.sourceDocuments.findMany({
        where: eq(sourceDocuments.ledgerId, ledger.id),
      });

      expect(orphaned).toHaveLength(0);
    });
  });
});
