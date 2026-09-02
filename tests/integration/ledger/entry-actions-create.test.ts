import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, users } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { and, eq, isNull, sql } from "drizzle-orm";

const { getRatesMock, convertBatchMock } = vi.hoisted(() => ({
  getRatesMock: vi.fn(async () => ({
    base: "USD",
    date: "2026-01-01",
    rates: { CNY: 1 } as Record<string, number>,
  })),
  convertBatchMock: vi.fn(),
}));

vi.mock("@/application/adapters/postgres/exchange-rate", () => {
  const rateBook = {
    getRates: getRatesMock,
    convertBatch: convertBatchMock,
  };
  return { ExchangeRateService: rateBook, postgresFxRateBook: rateBook, fetchWithRetry: vi.fn() };
});
import { createLedgerEntryAction } from "@/modules/ledger/actions";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

async function seedDoc(db: ReturnType<typeof getTestDb>, ledgerId: string, entryDate?: string) {
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      id: uuidv4(),
      ledgerId,
      currentStatus: "completed",
      type: "ai_parsed",
      entryDate: entryDate ?? null,
    })
    .returning();
  expect(doc).toBeDefined();
  if (doc === undefined) {
    throw new Error("Expected source document insert to return a row");
  }
  await activateTestSourceDocumentProjection(db, doc.id);
  return doc;
}

describe("createLedgerEntryAction", () => {
  let ledgerId: string;
  let docId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,

      mainCurrency: "CNY",
    });
    const doc = await seedDoc(db, ledgerId);
    docId = doc.id;
  });

  it("creates entry with same currency as main currency (no conversion)", async () => {
    const result = await createLedgerEntryAction(
      ledgerId,
      {
        amount: "50",
        currency: "CNY",
        itemName: "午餐",
        sourceDocumentId: docId,
      },
      crypto.randomUUID()
    );

    expect(result.itemName).toBe("午餐");
    expect(result.amount).toBe("50.000");
    expect(result.convertedAmount).toBe("50.000");
    expect(result.exchangeRate).toBe("1");
    expect(getRatesMock).not.toHaveBeenCalled();
  });

  it("creates entry with foreign currency and triggers conversion", async () => {
    getRatesMock.mockResolvedValue({ base: "USD", date: "2026-01-01", rates: { CNY: 7.2 } });

    const result = await createLedgerEntryAction(
      ledgerId,
      {
        amount: "100",
        currency: "USD",
        itemName: "Coffee",
        sourceDocumentId: docId,
      },
      crypto.randomUUID()
    );

    expect(result.currency).toBe("USD");
    expect(result.convertedAmount).toBe("720.000");
    expect(getRatesMock).toHaveBeenCalledWith(undefined);
  });

  it.each([
    { currency: "JPY", amount: "12.6", expected: "13.000" },
    { currency: "KWD", amount: "12.3456", expected: "12.346" },
  ])("rounds $currency entries to their minor unit", async ({ currency, amount, expected }) => {
    await getTestDb()
      .update(ledgers)
      .set({ mainCurrency: currency })
      .where(eq(ledgers.id, ledgerId));

    const result = await createLedgerEntryAction(
      ledgerId,
      { amount, currency, itemName: `${currency} entry`, sourceDocumentId: docId },
      crypto.randomUUID()
    );

    expect(result.amount).toBe(expected);
    expect(result.convertedAmount).toBe(expected);
    expect(result.exchangeRate).toBe("1");
  });

  it("replays a completed create with the same operation ID", async () => {
    const operationId = crypto.randomUUID();
    const input = {
      amount: "12.34",
      currency: "CNY",
      itemName: "Idempotent entry",
      sourceDocumentId: docId,
    };

    const first = await createLedgerEntryAction(ledgerId, input, operationId);
    const replay = await createLedgerEntryAction(ledgerId, input, operationId);

    expect(replay).toEqual(first);
    const activeEntries = await getTestDb().query.ledgerEntries.findMany({
      where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
    });
    expect(activeEntries).toHaveLength(1);
  });

  it("rejects reuse of an operation ID with different content", async () => {
    const operationId = crypto.randomUUID();
    await createLedgerEntryAction(
      ledgerId,
      {
        amount: "10",
        currency: "CNY",
        itemName: "First content",
        sourceDocumentId: docId,
      },
      operationId
    );

    await expect(
      createLedgerEntryAction(
        ledgerId,
        {
          amount: "11",
          currency: "CNY",
          itemName: "Different content",
          sourceDocumentId: docId,
        },
        operationId
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });
  });

  it("coalesces concurrent creates with the same operation ID", async () => {
    const operationId = crypto.randomUUID();
    const input = {
      amount: "25",
      currency: "CNY",
      itemName: "Concurrent entry",
      sourceDocumentId: docId,
    };

    const [first, replay] = await Promise.all([
      createLedgerEntryAction(ledgerId, input, operationId),
      createLedgerEntryAction(ledgerId, input, operationId),
    ]);

    expect(replay).toEqual(first);
    const activeEntries = await getTestDb().query.ledgerEntries.findMany({
      where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
    });
    expect(activeEntries).toHaveLength(1);
  });

  it("rolls back the entry and claim when idempotency completion fails", async () => {
    const db = getTestDb();
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION cashier_test_fail_entry_idempotency_completion()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'completed' AND NEW.key LIKE 'ledger-entry:%' THEN
          RAISE EXCEPTION 'forced idempotency completion failure';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await db.execute(sql`
      CREATE TRIGGER cashier_test_fail_entry_idempotency_completion
      BEFORE UPDATE ON idempotency_records
      FOR EACH ROW EXECUTE FUNCTION cashier_test_fail_entry_idempotency_completion()
    `);
    const operationId = crypto.randomUUID();
    try {
      await expect(
        createLedgerEntryAction(
          ledgerId,
          {
            amount: "19",
            currency: "CNY",
            itemName: "Must roll back",
            sourceDocumentId: docId,
          },
          operationId
        )
      ).rejects.toThrow("Failed query");
    } finally {
      await db.execute(
        sql`DROP TRIGGER IF EXISTS cashier_test_fail_entry_idempotency_completion
          ON idempotency_records`
      );
      await db.execute(
        sql`DROP FUNCTION IF EXISTS cashier_test_fail_entry_idempotency_completion()`
      );
    }

    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
    });
    expect(activeEntries).toHaveLength(0);
    const claim = await db.execute(sql`
      SELECT key FROM idempotency_records
      WHERE principal_type = 'user'
        AND key = ${`ledger-entry:${ledgerId}:${operationId}`}
    `);
    expect(claim.rows).toHaveLength(0);
  });

  it("rejects a source document that belongs to a different ledger", async () => {
    const db = getTestDb();
    const otherLedgerId = uuidv4();
    await db.insert(users).values({
      id: "11111111-1111-1111-1111-111111111111",
      email: "other@example.com",
      name: "Other User",
      emailVerified: new Date(),
    });
    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: "11111111-1111-1111-1111-111111111111",
      mainCurrency: "CNY",
    });
    const otherDoc = await seedDoc(db, otherLedgerId);

    await expect(
      createLedgerEntryAction(
        ledgerId,
        {
          amount: "12",
          currency: "CNY",
          itemName: "Cross-ledger doc",
          sourceDocumentId: otherDoc.id,
        },
        crypto.randomUUID()
      )
    ).rejects.toThrow("Source document");
  });

  it("rejects a deleted source document", async () => {
    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, docId));

    await expect(
      createLedgerEntryAction(
        ledgerId,
        {
          amount: "12",
          currency: "CNY",
          itemName: "Deleted doc",
          sourceDocumentId: docId,
        },
        crypto.randomUUID()
      )
    ).rejects.toThrow("Source document");
  });

  it("throws 'Ledger not found' for wrong ledger", async () => {
    await expect(
      createLedgerEntryAction(
        uuidv4(),
        {
          amount: "50",
          currency: "CNY",
          itemName: "Test",
          sourceDocumentId: docId,
        },
        crypto.randomUUID()
      )
    ).rejects.toThrow("Ledger not found");
  });
});
