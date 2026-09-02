import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import {
  activateTestSourceDocumentProjection,
  createTestSourceDocument,
  createTestUserWithLedger,
} from "tests/helpers/schema-setup";
import { entryCategories, ledgerEntries, sourceDocuments } from "@/persistence";
import { eq } from "drizzle-orm";
import { getSourceDocumentFullQuery as getSourceDocumentFullQueryUseCase } from "@/modules/source-document/application/queries/get-source-document-full";
import {
  listSourceDocuments as listSourceDocumentsUseCase,
  querySourceDocumentPage as querySourceDocumentPageUseCase,
} from "@/modules/source-document/application/queries/list-source-document-page";
import { getPendingSourceDocuments as getPendingSourceDocumentsUseCase } from "@/modules/source-document/application/queries/get-pending-source-documents";
import { serverComposition } from "@/application/server-composition-root";

const queryPorts = {
  documents: serverComposition.sourceDocumentReads,
  ledgerReads: serverComposition.ledgerReads,
};
const querySourceDocumentPage = (
  ledgerId: string,
  params: Parameters<typeof querySourceDocumentPageUseCase>[1]
) => querySourceDocumentPageUseCase(ledgerId, params, queryPorts);
const listSourceDocuments = (
  ledgerId: string,
  params: Parameters<typeof listSourceDocumentsUseCase>[1]
) => listSourceDocumentsUseCase(ledgerId, params, queryPorts);
const getSourceDocumentFullQuery = (ledgerId: string, sourceDocumentId: string) =>
  getSourceDocumentFullQueryUseCase(ledgerId, sourceDocumentId, queryPorts.documents);
const getPendingSourceDocuments = (ledgerId: string) =>
  getPendingSourceDocumentsUseCase(ledgerId, queryPorts);

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
          currentStatus: "completed",
          entryDate: "2026-03-20",
        },
        {
          ledgerId,
          currentStatus: "completed",
          entryDate: "2026-03-19",
        },
        {
          ledgerId,
          currentStatus: "failed",
          entryDate: "2026-03-20",
        },
      ])
      .returning();
    for (const document of inserted) {
      await activateTestSourceDocumentProjection(db, document.id);
    }

    const page1 = await querySourceDocumentPage(ledgerId, {
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
        currentStatus: "completed",
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
    await activateTestSourceDocumentProjection(db, docId);

    const result = await querySourceDocumentPage(ledgerId, {
      includeLedgerEntries: true,
    });

    expect(result.items[0]?.id).toBe(docId);
    expect(result.items[0]?.ledgerEntries).toHaveLength(1);
    expect(result.items[0]?.ledgerEntries?.[0]).toEqual(
      expect.objectContaining({
        itemName: "Lunch",
        amount: "10.000",
      })
    );
  });

  it("returns full payload for an existing document and throws NotFoundError for a missing one", async () => {
    const db = getTestDb();
    const docId = await createTestSourceDocument(db, ledgerId, {
      text: "full payload",
      status: "processing",
      imageUrls: ["/api/uploads/a.jpg"],
      entryDate: "2026-03-22",
    });

    const existing = await getSourceDocumentFullQuery(ledgerId, docId);
    expect(existing).toMatchObject({
      id: docId,
      text: "full payload",
      files: [expect.objectContaining({ id: expect.any(String), contentType: "image/jpeg" })],
      status: "processing",
      createdAt: expect.any(String),
    });
    expect(existing).not.toHaveProperty("imageUrls");

    await expect(getSourceDocumentFullQuery(ledgerId, crypto.randomUUID())).rejects.toThrow(
      NotFoundError
    );
  });

  it("hides soft-deleted documents", async () => {
    const db = getTestDb();
    const deletedDoc = requireDefined(
      (
        await db
          .insert(sourceDocuments)
          .values({
            ledgerId,
            currentStatus: "completed",
            deletedAt: new Date(),
            entryDate: "2026-03-22",
          })
          .returning()
      )[0],
      "deleted source document"
    );

    const page = await querySourceDocumentPage(ledgerId, {});
    expect(page.items.find((item) => item.id === deletedDoc.id)).toBeUndefined();

    const storedDeletedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, deletedDoc.id),
    });
    expect(storedDeletedDoc?.currentStatus).toBe("completed");
    expect(storedDeletedDoc?.deletedAt).not.toBeNull();

    await expect(getSourceDocumentFullQuery(ledgerId, deletedDoc.id)).rejects.toThrow(
      NotFoundError
    );
  });

  it("returns pending groups through the public query barrel", async () => {
    const db = getTestDb();

    const documents = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          currentStatus: "processing",
          entryDate: "2026-03-23",
        },
        {
          ledgerId,
          currentStatus: "failed",
          entryDate: "2026-03-22",
        },
      ])
      .returning();
    for (const document of documents) {
      await activateTestSourceDocumentProjection(db, document.id);
    }

    const result = await getPendingSourceDocuments(ledgerId);

    expect(result.stats.total).toBeGreaterThan(0);
    expect(result.groups.processing).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
  });
});
