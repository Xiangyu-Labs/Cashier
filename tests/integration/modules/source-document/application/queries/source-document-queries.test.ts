import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { entryCategories, ledgerEntries, sourceDocuments } from "@/persistence";
import { eq } from "drizzle-orm";
import {
  getSourceDocumentCollection,
  getSourceDocumentFullQuery,
  listSourceDocuments,
  listSourceDocumentsQuery,
} from "@/modules/source-document/application/queries/source-document-queries";
import { getPendingSourceDocuments } from "@/modules/source-document/queries";

function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${label}`);
  }
  return value;
}

describe("source-document-queries", () => {
  let ledgerId = "";
  let categoryId = "";

  beforeEach(async () => {
    const db = getTestDb();
    const setup = await createTestUserWithLedger(db);
    ledgerId = setup.ledgerId;

    const categories = await db
      .insert(entryCategories)
      .values({
        ledgerId,
        name: "Food",
        sortOrder: 1,
      })
      .returning();
    categoryId = requireDefined(categories[0], "category").id;
  });

  it("filters by status/date, paginates, and emits a cursor", async () => {
    const db = getTestDb();
    const inserted = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          text: "completed-new",
          status: "completed",
          imageUrls: [],
          entryDate: "2026-03-20",
        },
        {
          ledgerId,
          text: "completed-old",
          status: "completed",
          imageUrls: [],
          entryDate: "2026-03-19",
        },
        {
          ledgerId,
          text: "failed",
          status: "failed",
          imageUrls: [],
          entryDate: "2026-03-20",
        },
      ])
      .returning();

    const page1 = await listSourceDocumentsQuery(ledgerId, {
      status: "completed",
      startDate: "2026-03-19",
      endDate: "2026-03-20",
      limit: 1,
    });

    expect(page1.items).toHaveLength(1);
    expect(page1.items[0]?.id).toBe(requireDefined(inserted[0], "first doc").id);
    expect(page1.nextCursor).not.toBeNull();

    expect(inserted).toHaveLength(3);
  });

  it("rejects legacy two-segment cursors", async () => {
    await expect(
      listSourceDocuments(ledgerId, {
        cursor: "2026-03-23T10:00:00.000Z|doc-id",
      } as never)
    ).rejects.toThrow(ValidationError);
  });

  it("includes ledger entries when requested", async () => {
    const db = getTestDb();
    const docs = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "has entry",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-21",
      })
      .returning();
    const docId = requireDefined(docs[0], "source document").id;

    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: docId,
      categoryId,
      amount: "10.00",
      currency: "CNY",
      itemName: "Lunch",
    });

    const result = await listSourceDocumentsQuery(ledgerId, {
      includeLedgerEntries: true,
    });

    expect(result.items[0]?.id).toBe(docId);
    expect(result.items[0]?.ledgerEntries).toHaveLength(1);
    expect(result.items[0]?.ledgerEntries?.[0]).toEqual(
      expect.objectContaining({
        itemName: "Lunch",
        amount: "10.00",
      })
    );
  });

  it("returns full payload for an existing document and throws NotFoundError for a missing one", async () => {
    const db = getTestDb();
    const docs = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "full payload",
        status: "queued",
        imageUrls: ["/api/uploads/a.jpg"],
        entryDate: "2026-03-22",
      })
      .returning();
    const docId = requireDefined(docs[0], "source document").id;

    const existing = await getSourceDocumentFullQuery(ledgerId, docId);
    expect(existing).toEqual({
      id: docId,
      text: "full payload",
      imageUrls: ["/api/uploads/a.jpg"],
      status: "queued",
      createdAt: expect.any(String),
    });

    await expect(getSourceDocumentFullQuery(ledgerId, crypto.randomUUID())).rejects.toThrow(
      NotFoundError
    );
  });

  it("hides documents whose status is deleted even when deletedAt is null", async () => {
    const db = getTestDb();
    const deletedDoc = requireDefined(
      (
        await db
          .insert(sourceDocuments)
          .values({
            ledgerId,
            text: "should be hidden",
            status: "deleted",
            deletedAt: null,
            imageUrls: [],
            entryDate: "2026-03-22",
          })
          .returning()
      )[0],
      "deleted source document"
    );

    const page = await listSourceDocumentsQuery(ledgerId, {});
    expect(page.items.find((item) => item.id === deletedDoc.id)).toBeUndefined();

    const storedDeletedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, deletedDoc.id),
    });
    expect(storedDeletedDoc?.status).toBe("deleted");
    expect(storedDeletedDoc?.deletedAt).toBeNull();

    await expect(getSourceDocumentFullQuery(ledgerId, deletedDoc.id)).rejects.toThrow(
      NotFoundError
    );
  });

  it("filters source documents by aggregated converted amount", async () => {
    const db = getTestDb();
    const docs = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          text: "small amount doc",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-07-01",
        },
        {
          ledgerId,
          text: "large amount doc",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-07-02",
        },
      ])
      .returning();

    const firstDoc = requireDefined(docs[0], "first source document");
    const secondDoc = requireDefined(docs[1], "second source document");

    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: firstDoc.id,
        amount: "10",
        convertedAmount: "10",
        currency: "CNY",
        itemName: "small item",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: secondDoc.id,
        amount: "20",
        convertedAmount: "120",
        currency: "USD",
        itemName: "large item",
        categoryId,
      },
    ]);

    const result = await getSourceDocumentCollection(ledgerId, {
      minAmount: 100,
      limit: 1000,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(secondDoc.id);
  });

  it("returns pending groups through the public query barrel", async () => {
    const db = getTestDb();

    await db.insert(sourceDocuments).values([
      {
        ledgerId,
        text: "queued doc",
        status: "queued",
        imageUrls: [],
        entryDate: "2026-03-23",
      },
      {
        ledgerId,
        text: "failed doc",
        status: "failed",
        imageUrls: [],
        entryDate: "2026-03-22",
      },
    ]);

    const result = await getPendingSourceDocuments(ledgerId);

    expect(result.stats.total).toBeGreaterThan(0);
    expect(result.groups.queued).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
  });
});
