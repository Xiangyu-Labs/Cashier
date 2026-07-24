import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import {
  activateTestSourceDocumentProjection,
  createTestUserWithLedger,
} from "tests/helpers/schema-setup";
import { entryCategories, ledgerEntries, sourceDocuments } from "@/persistence";
import { eq } from "drizzle-orm";
import { getSourceDocumentFullQuery } from "@/modules/source-document/application/queries/get-source-document-full";
import { getSourceDocumentCollection } from "@/modules/source-document/application/queries/list-source-document-collection";
import {
  listSourceDocuments,
  querySourceDocumentPage,
} from "@/modules/source-document/application/queries/list-source-document-page";
import { getPendingSourceDocuments } from "@/modules/source-document/application/queries/get-pending-source-documents";
import { listStreamPage } from "@/modules/source-document/application/queries/list-stream-page";
import { countSourceDocumentsByStatus } from "@/application/adapters/postgres/read-models";

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
    await activateTestSourceDocumentProjection(db, docId);

    const result = await querySourceDocumentPage(ledgerId, {
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
    await activateTestSourceDocumentProjection(db, docId);

    const existing = await getSourceDocumentFullQuery(ledgerId, docId);
    expect(existing).toMatchObject({
      id: docId,
      text: "full payload",
      files: [
        expect.objectContaining({ id: expect.any(String), contentType: "image/jpeg" }),
      ],
      status: "queued",
      createdAt: expect.any(String),
    });
    expect(existing).not.toHaveProperty("imageUrls");

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

    const page = await querySourceDocumentPage(ledgerId, {});
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
    await activateTestSourceDocumentProjection(db, firstDoc.id);
    await activateTestSourceDocumentProjection(db, secondDoc.id);

    const result = await getSourceDocumentCollection(ledgerId, {
      minAmount: 100,
      limit: 1000,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(secondDoc.id);
  });

  it("returns pending groups through the public query barrel", async () => {
    const db = getTestDb();

    const documents = await db
      .insert(sourceDocuments)
      .values([
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
      ])
      .returning();
    for (const document of documents) {
      await activateTestSourceDocumentProjection(db, document.id);
    }

    const result = await getPendingSourceDocuments(ledgerId);

    expect(result.stats.total).toBeGreaterThan(0);
    expect(result.groups.queued).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Stream page integration tests (Task 2 review)
  // ---------------------------------------------------------------------------

  it("walks all cursor pages through 40+ interleaved status records", async () => {
    const db = getTestDb();
    const statuses = ["queued", "processing", "completed", "anomaly", "failed"] as const;
    const docs: Array<{ id: string; status: string }> = [];

    // Insert 45 documents (9 per status) with descending entry dates
    for (let i = 0; i < 45; i++) {
      const status = statuses[i % statuses.length]!;
      const day = 25 - Math.floor(i / 5);
      const inserted = await db
        .insert(sourceDocuments)
        .values({
          ledgerId,
          text: `stream-test-${i}`,
          status,
          imageUrls: [],
          entryDate: `2026-03-${String(day).padStart(2, "0")}`,
          createdAt: new Date(`2026-03-${String(day).padStart(2, "0")}T${String(10 + (i % 10)).padStart(2, "0")}:00:00Z`),
        })
        .returning();
      docs.push({ id: inserted[0]!.id, status });
    }
    for (const doc of docs) {
      await activateTestSourceDocumentProjection(db, doc.id);
    }

    // Walk all pages with page size 5
    let cursor: string | undefined;
    let totalItems = 0;
    const seenIds = new Set<string>();
    const allItems: Array<{ id: string; effectiveDate: string | null }> = [];

    for (let pageNum = 0; pageNum < 20; pageNum++) {
      const page = await listStreamPage(ledgerId, {
        cursor,
        limit: 5,
      });
      if (page.items.length === 0) break;

      totalItems += page.items.length;
      for (const item of page.items) {
        expect(seenIds.has(item.id)).toBe(false);
        seenIds.add(item.id);
        // Build effective date for assertion
        const effectiveDate = item.entryDate ?? item.createdAt.slice(0, 10);
        allItems.push({ id: item.id, effectiveDate });
      }

      cursor = page.nextCursor ?? undefined;
      if (cursor == null) break;
    }

    // All 45 documents returned with no duplicates
    expect(totalItems).toBe(45);
    expect(seenIds.size).toBe(45);

    // Verify descending order by effective date, then createdAt (implied by insertion order within same date)
    for (let i = 1; i < allItems.length; i++) {
      const prev = allItems[i - 1]!;
      const curr = allItems[i]!;
      expect(prev.effectiveDate!.localeCompare(curr.effectiveDate!)).toBeGreaterThanOrEqual(0);
    }
  });

  it("sorts null entryDate records by createdAt calendar date", async () => {
    const db = getTestDb();
    const today = new Date("2026-03-20T08:00:00Z");
    const yesterday = new Date("2026-03-19T10:00:00Z");

    const inserted = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          title: "null-date-older",
          status: "completed",
          imageUrls: [],
          entryDate: null,
          createdAt: today,
        },
        {
          ledgerId,
          title: "null-date-newer",
          status: "completed",
          imageUrls: [],
          entryDate: "2026-03-18",
          createdAt: yesterday,
        },
        {
          ledgerId,
          title: "has-explicit-date",
          status: "completed",
          imageUrls: [],
          entryDate: "2026-03-19",
          createdAt: new Date("2026-03-19T12:00:00Z"),
        },
      ])
      .returning();
    for (const doc of inserted) {
      await activateTestSourceDocumentProjection(db, doc.id);
    }

    const page = await listStreamPage(ledgerId, { limit: 10 });

    const nullDateOlder = page.items.find((i) => i.title === "null-date-older");
    const nullDateNewer = page.items.find((i) => i.title === "null-date-newer");
    const explicitDate = page.items.find((i) => i.title === "has-explicit-date");

    expect(nullDateOlder).toBeDefined();
    expect(nullDateNewer).toBeDefined();
    expect(explicitDate).toBeDefined();

    const idxNullOlder = page.items.indexOf(nullDateOlder!);
    const idxNullNewer = page.items.indexOf(nullDateNewer!);
    const idxExplicit = page.items.indexOf(explicitDate!);

    // null-date-older has effective date 2026-03-20 (from createdAt), should come first
    expect(idxNullOlder).toBeLessThan(idxExplicit);
    // null-date-newer has effective date 2026-03-19 (from createdAt), should sort after explicit 2026-03-19
    // because within same effective date, order is by createdAt DESC (null-date-newer has createdAt 2026-03-19T10:00:00Z)
    // and explicit has createdAt 2026-03-19T12:00:00Z, so explicit comes first
    expect(idxExplicit).toBeLessThan(idxNullNewer);
  });

  it("resolves equal ordering tuples (same date, same createdAt) by ID descending", async () => {
    const db = getTestDb();
    const sameDate = "2026-03-20";
    const sameCreatedAt = new Date("2026-03-20T12:00:00Z");

    // Insert docs with known IDs via direct SQL
    const idA = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    const idC = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

    await db.insert(sourceDocuments).values([
      {
        id: idA,
        ledgerId,
        text: "id-a",
        status: "completed",
        imageUrls: [],
        entryDate: sameDate,
        createdAt: sameCreatedAt,
      },
      {
        id: idB,
        ledgerId,
        text: "id-b",
        status: "completed",
        imageUrls: [],
        entryDate: sameDate,
        createdAt: sameCreatedAt,
      },
      {
        id: idC,
        ledgerId,
        text: "id-c",
        status: "completed",
        imageUrls: [],
        entryDate: sameDate,
        createdAt: sameCreatedAt,
      },
    ]);
    for (const id of [idA, idB, idC]) {
      await activateTestSourceDocumentProjection(db, id);
    }

    const page = await listStreamPage(ledgerId, { limit: 10 });

    const ids = page.items.map((i) => i.id);
    // Since order is DESC by effectiveDate, createdAt, then id,
    // equal dates and createdAt should sort by id DESC:
    // idC ("c...") > idB ("b...") > idA ("a...")
    expect(ids.indexOf(idC)).toBeLessThan(ids.indexOf(idB));
    expect(ids.indexOf(idB)).toBeLessThan(ids.indexOf(idA));
  });

  it("applies date, amount, and status filters before the page limit", async () => {
    const db = getTestDb();
    const docs = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          title: "completed-in-range",
          status: "completed",
          imageUrls: [],
          entryDate: "2026-03-15",
        },
        {
          ledgerId,
          title: "completed-outside-range",
          status: "completed",
          imageUrls: [],
          entryDate: "2026-03-01",
        },
        {
          ledgerId,
          title: "queued-in-range",
          status: "queued",
          imageUrls: [],
          entryDate: "2026-03-16",
        },
        {
          ledgerId,
          title: "anomaly-in-range",
          status: "anomaly",
          imageUrls: [],
          entryDate: "2026-03-14",
        },
      ])
      .returning();

    const completedInRange = docs.find((d) => d.title === "completed-in-range")!;
    const completedOutOfRange = docs.find((d) => d.title === "completed-outside-range")!;

    // Insert ledger entries BEFORE activation so the activation function
    // links them to the revision via sourceDocumentRevisionId
    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: completedInRange.id,
        amount: "50.00",
        currency: "CNY",
        itemName: "in-range item",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: completedOutOfRange.id,
        amount: "200.00",
        currency: "CNY",
        itemName: "out-of-range item",
        categoryId,
      },
    ]);

    // Activate projections once per doc
    for (const doc of docs) {
      await activateTestSourceDocumentProjection(db, doc.id);
    }

    // Filter by status = completed, date range, and amount
    const page = await listStreamPage(ledgerId, {
      statuses: ["completed"],
      startDate: "2026-03-10",
      endDate: "2026-03-20",
      minAmount: 10,
      maxAmount: 100,
      limit: 10,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(completedInRange.id);
  });

  it("excludes deleted rows from the stream", async () => {
    const db = getTestDb();
    const active = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "active doc",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-20",
      })
      .returning();
    const deleted = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "deleted doc",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-19",
        deletedAt: new Date(),
      })
      .returning();
    for (const doc of [...active, ...deleted]) {
      await activateTestSourceDocumentProjection(db, doc.id);
    }

    const page = await listStreamPage(ledgerId, { limit: 10 });

    expect(page.items.some((i) => i.id === deleted[0]!.id)).toBe(false);
    expect(page.items.some((i) => i.id === active[0]!.id)).toBe(true);
  });

  it("leaves global counts unchanged by stream filters", async () => {
    const db = getTestDb();
    await db.insert(sourceDocuments).values([
      {
        ledgerId,
        text: "queued doc",
        status: "queued",
        imageUrls: [],
        entryDate: "2026-03-20",
      },
      {
        ledgerId,
        text: "completed doc",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-19",
      },
      {
        ledgerId,
        text: "anomaly doc",
        status: "anomaly",
        imageUrls: [],
        entryDate: "2026-03-18",
      },
    ]);
    // Activate projections to set up revision state
    const allDocs = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.ledgerId, ledgerId));
    for (const doc of allDocs) {
      await activateTestSourceDocumentProjection(db, doc.id);
    }

    const counts = await countSourceDocumentsByStatus(ledgerId);

    // The queued doc counts as processing (queued), completed as completed, anomaly as attention
    expect(counts.processingCount).toBe(1); // queued → processing in attention
    expect(counts.attentionCount).toBe(1); // anomaly

    // Stream page with status filter should not affect counts
    const page = await listStreamPage(ledgerId, {
      statuses: ["completed"],
      limit: 10,
    });
    expect(page.items.length).toBeGreaterThanOrEqual(0);

    const countsAfter = await countSourceDocumentsByStatus(ledgerId);
    expect(countsAfter.processingCount).toBe(counts.processingCount);
    expect(countsAfter.attentionCount).toBe(counts.attentionCount);
  });

  it("walks all cursors from start to final null", async () => {
    const db = getTestDb();

    // Create 25 documents with varying entry dates
    for (let i = 0; i < 25; i++) {
      const day = 28 - i;
      const inserted = await db
        .insert(sourceDocuments)
        .values({
          ledgerId,
          text: `cursor-walk-${i}`,
          status: "completed",
          imageUrls: [],
          entryDate: `2026-03-${String(day).padStart(2, "0")}`,
          createdAt: new Date(`2026-03-${String(day).padStart(2, "0")}T12:00:00Z`),
        })
        .returning();
      await activateTestSourceDocumentProjection(db, inserted[0]!.id);
    }

    let pageCount = 0;
    let cursor: string | undefined;
    const seenInWalk = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const page = await listStreamPage(ledgerId, {
        cursor,
        limit: 7,
      });
      pageCount++;
      for (const item of page.items) {
        expect(seenInWalk.has(item.id)).toBe(false);
        seenInWalk.add(item.id);
      }
      cursor = page.nextCursor ?? undefined;
      if (cursor == null) break;
    }

    expect(seenInWalk.size).toBe(25);
    expect(pageCount).toBe(4); // 7+7+7+4 = 25
    expect(cursor).toBeUndefined();
  });
});
