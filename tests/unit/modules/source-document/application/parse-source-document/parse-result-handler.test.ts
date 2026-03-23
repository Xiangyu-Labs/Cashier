import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";

const { convertEntryAmountMock } = vi.hoisted(() => ({
  convertEntryAmountMock: vi.fn(),
}));

vi.mock("@/lib/orchestration/exchange-rate-ledger-recalculation", () => ({
  initializeExchangeRateLedgerRecalculationOrchestration: vi.fn(),
}));

vi.mock("@/modules/currency/use-cases", () => ({
  convertEntryAmount: convertEntryAmountMock,
}));

import { handleParseResult } from "@/modules/source-document/application/parse-source-document/parse-result-handler";
import { entryCategories, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";

async function createSourceDocument(ledgerId: string, overrides: Record<string, unknown> = {}) {
  const db = getTestDb();
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      ledgerId,
      status: "processing",
      entryDate: "2026-03-20",
      imageUrls: [],
      metadata: {},
      ...overrides,
    })
    .returning();

  if (doc == null) {
    throw new Error("Expected source document");
  }

  return doc;
}

async function listActiveEntries(sourceDocumentId: string) {
  const db = getTestDb();
  return db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.sourceDocumentId, sourceDocumentId), isNull(ledgerEntries.deletedAt)));
}

describe("handleParseResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks anomaly results without saving ledger entries", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const doc = await createSourceDocument(ledgerId);

    await handleParseResult({
      ledgerId,
      sourceDocumentId: doc.id,
      parsedEntries: [
        {
          amount: 10,
          currency: "USD",
          categoryIndex: 0,
          entryDate: null,
          itemName: "Lunch",
          notes: null,
        },
      ],
      anomalyReason: "Results diverged",
      verificationStatus: "anomaly",
      categories: [],
    });

    const refreshed = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });

    expect(refreshed).toMatchObject({
      status: "anomaly",
      anomalyReason: "Results diverged",
    });
    expect(await listActiveEntries(doc.id)).toEqual([]);
  });

  it("marks validation failures as anomaly and keeps entries empty", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const doc = await createSourceDocument(ledgerId);

    await handleParseResult({
      ledgerId,
      sourceDocumentId: doc.id,
      parsedEntries: [
        {
          amount: 1,
          currency: "unknown",
          categoryIndex: 0,
          entryDate: null,
          itemName: "Bad",
          notes: null,
        },
      ],
      verificationStatus: "passed",
      categories: [],
    });

    const refreshed = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });

    expect(refreshed).toMatchObject({
      status: "anomaly",
      anomalyReason: "Unable to recognize currency type",
    });
    expect(await listActiveEntries(doc.id)).toEqual([]);
  });

  it("completes the document and replaces entries with converted and main-currency values", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const doc = await createSourceDocument(ledgerId);
    const [category] = await db
      .insert(entryCategories)
      .values({
        ledgerId,
        name: "Food",
        description: null,
      })
      .returning();

    if (category == null) {
      throw new Error("Expected category");
    }

    await db
      .update(ledgers)
      .set({ metadata: { settings: { mainCurrency: "CNY" } } })
      .where(eq(ledgers.id, ledgerId));

    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: doc.id,
      categoryId: null,
      amount: "9.99",
      currency: "CNY",
      itemName: "Old entry",
      description: null,
      convertedAmount: "9.99",
      exchangeRate: "1",
    });

    convertEntryAmountMock.mockResolvedValueOnce({
      convertedAmount: "72.00",
      exchangeRate: "7.2000",
    });

    await handleParseResult({
      ledgerId,
      sourceDocumentId: doc.id,
      parsedEntries: [
        {
          amount: 10,
          currency: "USD",
          categoryIndex: 1,
          entryDate: null,
          itemName: "Lunch",
          notes: "converted",
        },
        {
          amount: 5,
          currency: "CNY",
          categoryIndex: 0,
          entryDate: null,
          itemName: "Taxi",
          notes: null,
        },
      ],
      title: "Parsed title",
      verificationStatus: "passed",
      categories: [{ id: category.id, name: category.name, description: category.description }],
    });

    const refreshed = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, doc.id),
    });
    const activeEntries = await listActiveEntries(doc.id);
    const deletedExisting = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.sourceDocumentId, doc.id),
          eq(ledgerEntries.itemName, "Old entry"),
          isNotNull(ledgerEntries.deletedAt)
        )
      );

    expect(refreshed).toMatchObject({
      status: "completed",
      title: "Parsed title",
    });
    expect(convertEntryAmountMock).toHaveBeenCalledWith({
      amount: 10,
      fromCurrency: "USD",
      toCurrency: "CNY",
      date: "2026-03-20",
    });
    expect(activeEntries).toHaveLength(2);
    expect(activeEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: category.id,
          amount: "10.00",
          currency: "USD",
          itemName: "Lunch",
          description: "converted",
          convertedAmount: "72.00",
          exchangeRate: "7.2000",
        }),
        expect.objectContaining({
          categoryId: null,
          amount: "5.00",
          currency: "CNY",
          itemName: "Taxi",
          description: null,
          convertedAmount: "5.00",
          exchangeRate: "1",
        }),
      ])
    );
    expect(deletedExisting).toHaveLength(1);
  });
});
