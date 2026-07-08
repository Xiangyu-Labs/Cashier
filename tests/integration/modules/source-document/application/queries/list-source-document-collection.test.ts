import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { sourceDocuments } from "@/persistence";
import { querySourceDocumentCollection } from "@/modules/source-document/application/queries/list-source-document-collection";
import type { SourceDocumentCollectionDto } from "@/modules/source-document/contracts";

describe("list-source-document-collection", () => {
  let ledgerId = "";

  beforeEach(async () => {
    const db = getTestDb();
    const setup = await createTestUserWithLedger(db);
    ledgerId = setup.ledgerId;
  });

  it("returns source document collection without search parameter", async () => {
    const db = getTestDb();
    await db.insert(sourceDocuments).values([
      {
        ledgerId,
        text: "receipt one",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-20",
      },
      {
        ledgerId,
        text: "receipt two",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-19",
      },
      {
        ledgerId,
        text: "invoice three",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-03-18",
      },
    ]);

    const result: SourceDocumentCollectionDto =
      await querySourceDocumentCollection(ledgerId, {
        startDate: null,
        endDate: null,
        limit: 100,
      });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it("returns collection with date range filtering still working", async () => {
    const db = getTestDb();
    await db.insert(sourceDocuments).values([
      {
        ledgerId,
        title: "old receipt",
        text: "old receipt",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-01-15",
      },
      {
        ledgerId,
        title: "new receipt",
        text: "new receipt",
        status: "completed",
        imageUrls: [],
        entryDate: "2026-06-15",
      },
    ]);

    const result = await querySourceDocumentCollection(ledgerId, {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      limit: 100,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe("new receipt");
  });

  it("respects the limit and reports hasMore correctly", async () => {
    const db = getTestDb();
    const docs = Array.from({ length: 5 }, (_, i) => ({
      ledgerId,
      text: `receipt ${i + 1}`,
      status: "completed" as const,
      imageUrls: [] as string[],
      entryDate: `2026-03-${String(20 - i).padStart(2, "0")}`,
    }));
    await db.insert(sourceDocuments).values(docs);

    const result = await querySourceDocumentCollection(ledgerId, {
      startDate: null,
      endDate: null,
      limit: 3,
    });

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(5);
  });
});
