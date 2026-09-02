import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb } from "tests/setup";
import {
  activateTestSourceDocumentProjection,
  createTestUserWithLedger,
} from "tests/helpers/schema-setup";
import {
  entryCategories,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { eq } from "drizzle-orm";
import { listSourceDocuments as listSourceDocumentsUseCase } from "@/modules/source-document/application/queries/list-source-document-page";
import { listStreamPage as listStreamPageUseCase } from "@/modules/source-document/application/queries/list-stream-page";
import { getStreamTotal as getStreamTotalUseCase } from "@/modules/source-document/application/queries/get-stream-total";
import { countSourceDocumentsByStatus } from "@/application/adapters/postgres/source-document-reads";
import { serverComposition } from "@/application/server-composition-root";

const queryPorts = {
  documents: serverComposition.sourceDocumentReads,
  ledgerReads: serverComposition.ledgerReads,
};
const listSourceDocuments = (
  ledgerId: string,
  params: Parameters<typeof listSourceDocumentsUseCase>[1]
) => listSourceDocumentsUseCase(ledgerId, params, queryPorts);
const listStreamPage = (ledgerId: string, input: Parameters<typeof listStreamPageUseCase>[1]) =>
  listStreamPageUseCase(ledgerId, input, queryPorts);
const getStreamTotal = (ledgerId: string, input: Parameters<typeof getStreamTotalUseCase>[1]) =>
  getStreamTotalUseCase(ledgerId, input, queryPorts.documents);

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

  it("excludes unconverted entries from amount filters while preserving details", async () => {
    const db = getTestDb();
    const [document] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        title: "Coffee and cake",
        currentStatus: "completed",
        entryDate: "2026-03-20",
      })
      .returning();
    const sourceDocument = requireDefined(document, "filtered subtotal document");
    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: sourceDocument.id,
        amount: "20.00",
        convertedAmount: null,
        currency: "CNY",
        itemName: "Coffee",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: sourceDocument.id,
        amount: "80.00",
        convertedAmount: "80.00",
        currency: "CNY",
        itemName: "Cake",
        categoryId,
      },
    ]);
    await activateTestSourceDocumentProjection(db, sourceDocument.id);

    const stream = await listStreamPage(ledgerId, { maxAmount: "30", limit: 10 });
    expect(stream.items).toHaveLength(0);
    await expect(getStreamTotal(ledgerId, { maxAmount: "30" })).resolves.toEqual({
      total: "0",
      unconvertedCount: 0,
    });

    const detail = await listSourceDocuments(ledgerId, {
      limit: 10,
      includeEntries: true,
    });
    expect(detail.items.find((item) => item.id === sourceDocument.id)?.ledgerEntries).toHaveLength(
      2
    );
  });

  it("totals only completed documents across the full Stream filter", async () => {
    const db = getTestDb();
    const docs = await db
      .insert(sourceDocuments)
      .values([
        {
          ledgerId,
          title: "completed-total",
          currentStatus: "completed",
          entryDate: "2026-03-15",
        },
        {
          ledgerId,
          title: "failed-with-active-result",
          currentStatus: "completed",
          entryDate: "2026-03-16",
        },
        {
          ledgerId,
          title: "completed-out-of-range",
          currentStatus: "completed",
          entryDate: "2026-02-01",
        },
      ])
      .returning();
    const completed = requireDefined(docs[0], "completed total document");
    const failed = requireDefined(docs[1], "failed total document");
    const outOfRange = requireDefined(docs[2], "out of range total document");

    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: completed.id,
        amount: "125.25",
        convertedAmount: "125.25",
        currency: "CNY",
        itemName: "completed item",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: failed.id,
        amount: "75.00",
        convertedAmount: "75.00",
        currency: "CNY",
        itemName: "old active item",
        categoryId,
      },
      {
        ledgerId,
        sourceDocumentId: outOfRange.id,
        amount: "200.00",
        convertedAmount: "200.00",
        currency: "CNY",
        itemName: "out of range item",
        categoryId,
      },
    ]);

    for (const doc of docs) {
      await activateTestSourceDocumentProjection(db, doc.id);
    }

    const failedRevision = requireDefined(
      (
        await db
          .insert(sourceDocumentRevisions)
          .values({
            ledgerId,
            sourceDocumentId: failed.id,
            revisionNumber: 2,
            submittedText: "retry",
            outcome: "failed",
            finalizedAt: new Date(),
          })
          .returning()
      )[0],
      "failed pending revision"
    );
    await db
      .update(sourceDocuments)
      .set({ pendingRevisionId: failedRevision.id })
      .where(eq(sourceDocuments.id, failed.id));

    await expect(
      getStreamTotal(ledgerId, {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      })
    ).resolves.toEqual({ total: "125.25", unconvertedCount: 0 });
    await expect(getStreamTotal(ledgerId, { statuses: ["processing"] })).resolves.toEqual({
      total: "0",
      unconvertedCount: 0,
    });
    await expect(getStreamTotal(ledgerId, { statuses: ["completed", "failed"] })).resolves.toEqual({
      total: "325.25",
      unconvertedCount: 0,
    });
    await expect(getStreamTotal(ledgerId, { minAmount: "100", maxAmount: "150" })).resolves.toEqual(
      {
        total: "125.25",
        unconvertedCount: 0,
      }
    );
  });

  it("excludes deleted rows from the stream", async () => {
    const db = getTestDb();
    const active = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        currentStatus: "completed",
        entryDate: "2026-03-20",
      })
      .returning();
    const deleted = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        currentStatus: "completed",
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
        currentStatus: "processing",
        entryDate: "2026-03-20",
      },
      {
        ledgerId,
        currentStatus: "completed",
        entryDate: "2026-03-19",
      },
      {
        ledgerId,
        currentStatus: "anomaly",
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

    // The processing doc counts as processing (processing), completed as completed, anomaly as attention
    expect(counts.processingCount).toBe(1); // processing → processing in attention
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
});
