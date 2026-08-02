import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import {
  activateTestSourceDocumentProjection,
  createTestUserWithLedger,
} from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

describe("deleteSourceDocument", () => {
  let ledgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();
    ({ ledgerId } = await createTestUserWithLedger(db, undefined, "Lifecycle Delete Ledger"));
  });

  it("soft deletes target projections", async () => {
    const db = getTestDb();
    const [sourceDocument] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        currentStatus: "completed",
        entryDate: "2026-03-22",
      })
      .returning();

    if (sourceDocument == null) {
      throw new Error("Expected source document to be created");
    }

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        ledgerId,
        sourceDocumentId: sourceDocument.id,
        categoryId: null,
        amount: "8.90",
        currency: "USD",
        itemName: "Coffee",
        description: "Seeded ledger entry",
      })
      .returning();

    if (entry == null) {
      throw new Error("Expected delete lifecycle fixtures to be created");
    }
    await activateTestSourceDocumentProjection(db, sourceDocument.id);

    const result = await deleteSourceDocument({
      ledgerId,
      sourceDocumentId: sourceDocument.id,
    });

    expect(result).toEqual({
      sourceDocumentId: sourceDocument.id,
      deleted: true,
    });

    const deletedDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocument.id),
    });
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, sourceDocument.id),
        isNull(ledgerEntries.deletedAt)
      ),
    });

    expect(deletedDocument).toMatchObject({
      id: sourceDocument.id,
      currentStatus: "completed",
      deletedAt: expect.any(Date),
    });
    expect(activeEntries).toEqual([]);
  });
});
