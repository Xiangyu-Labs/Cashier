import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import { updateLedger as updateLedgerUseCase } from "@/modules/ledger/application/use-cases/update-ledger";
import { serverComposition } from "@/application/server-composition-root";
import { hasActiveEntries } from "@/modules/ledger/application/queries/has-active-entries";
import {
  currencyRates,
  ledgerEntries,
  ledgers,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

const updateLedger = (
  ...args: Parameters<typeof updateLedgerUseCase> extends [...infer Head, unknown] ? Head : never
) => updateLedgerUseCase(...args, serverComposition.settings);

describe("target Settings currency workflow", () => {
  let ledgerId = "";
  let sourceDocumentId: string;

  async function createEntry() {
    const result = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      entryDate: "2026-07-15",
      entries: [
        {
          id: crypto.randomUUID(),
          categoryId: null,
          amount: "80.00",
          currency: "CNY",
          itemName: "Atomic currency entry",
          description: null,
          convertedAmount: "80.00",
          exchangeRate: "1.000000",
        },
      ],
    });
    sourceDocumentId = result.sourceDocumentId;
  }

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    ({ ledgerId } = await createTestUserWithLedger(db));
    await db.insert(currencyRates).values({
      date: "2026-07-15",
      base: "EUR",
      rates: { CNY: 8, USD: 1 },
    });
  });

  it("allows main currency change on empty ledger", async () => {
    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { mainCurrency: "USD" },
    });
    expect(updated.settings.mainCurrency).toBe("USD");
  });

  it("changes main currency and recalculates active entries atomically", async () => {
    await createEntry();

    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { mainCurrency: "USD" },
    });
    const entry = await getTestDb().query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.ledgerId, ledgerId),
    });

    expect(updated.settings.mainCurrency).toBe("USD");
    expect(entry?.amount).toBe("80.00");
    expect(entry?.currency).toBe("CNY");
    expect(entry?.convertedAmount).toBe("10.00");
    expect(entry?.exchangeRate).toBe("0.125000");
  });

  it("recalculates both active and pending revision entries", async () => {
    const db = getTestDb();
    const sourceDocumentId = crypto.randomUUID();
    const activeRevisionId = crypto.randomUUID();
    const pendingRevisionId = crypto.randomUUID();
    await db.insert(sourceDocuments).values({
      id: sourceDocumentId,
      ledgerId,
      entryDate: "2026-07-15",
    });
    await db.insert(sourceDocumentRevisions).values([
      {
        id: activeRevisionId,
        ledgerId,
        sourceDocumentId,
        revisionNumber: 1,
        outcome: "completed",
        finalizedAt: new Date(),
      },
      {
        id: pendingRevisionId,
        ledgerId,
        sourceDocumentId,
        revisionNumber: 2,
        outcome: "processing",
      },
    ]);
    await db
      .update(sourceDocuments)
      .set({ activeRevisionId, pendingRevisionId })
      .where(eq(sourceDocuments.id, sourceDocumentId));
    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId,
        sourceDocumentRevisionId: activeRevisionId,
        amount: "80.00",
        currency: "CNY",
        itemName: "Active",
        convertedAmount: "80.00",
        exchangeRate: "1.000000",
      },
      {
        ledgerId,
        sourceDocumentId,
        sourceDocumentRevisionId: pendingRevisionId,
        amount: "40.00",
        currency: "CNY",
        itemName: "Pending",
        convertedAmount: "40.00",
        exchangeRate: "1.000000",
      },
    ]);

    await updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "USD" } });

    const entries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.ledgerId, ledgerId),
    });
    expect(entries.map((entry) => entry.convertedAmount).sort()).toEqual(["10.00", "5.00"]);
    expect(entries.every((entry) => entry.exchangeRate === "0.125000")).toBe(true);
  });

  it("allows other setting changes when entries exist", async () => {
    await createEntry();

    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { aiLanguage: "en" },
    });
    expect(updated.settings.aiLanguage).toBe("en");
    expect(updated.settings.mainCurrency).toBe("CNY");
  });

  it("hasActiveEntries returns false for empty ledger", async () => {
    expect(await hasActiveEntries(ledgerId, serverComposition.ledgerReads)).toBe(false);
  });

  it("hasActiveEntries returns true after entry creation", async () => {
    await createEntry();
    expect(await hasActiveEntries(ledgerId, serverComposition.ledgerReads)).toBe(true);
  });

  it("hasActiveEntries returns false after source document is soft-deleted", async () => {
    await createEntry();
    expect(await hasActiveEntries(ledgerId, serverComposition.ledgerReads)).toBe(true);

    // Soft-delete the source document so its entries are no longer active
    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    expect(await hasActiveEntries(ledgerId, serverComposition.ledgerReads)).toBe(false);
  });

  it("allows main currency change after source document is soft-deleted", async () => {
    await createEntry();

    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { mainCurrency: "USD" },
    });
    expect(updated.settings.mainCurrency).toBe("USD");
  });

  it("rolls back settings and conversions when a required rate is unavailable", async () => {
    await createEntry();

    await expect(
      updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "ZZZ" } })
    ).rejects.toThrow("Unsupported currency conversion");

    const [ledger, entry] = await Promise.all([
      getTestDb().query.ledgers.findFirst({ where: eq(ledgers.id, ledgerId) }),
      getTestDb().query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.ledgerId, ledgerId),
      }),
    ]);
    expect(ledger?.mainCurrency).toBe("CNY");
    expect(entry?.convertedAmount).toBe("80.00");
    expect(entry?.exchangeRate).toBe("1.000000");
  });

  it("rolls back the entire main-currency change when a historical rate is missing", async () => {
    await createEntry();
    const db = getTestDb();
    const sourceDocumentId = crypto.randomUUID();
    const activeRevisionId = crypto.randomUUID();
    await db.insert(sourceDocuments).values({
      id: sourceDocumentId,
      ledgerId,
      entryDate: "2026-07-14",
    });
    await db.insert(sourceDocumentRevisions).values({
      id: activeRevisionId,
      ledgerId,
      sourceDocumentId,
      revisionNumber: 1,
      outcome: "completed",
      finalizedAt: new Date(),
    });
    await db
      .update(sourceDocuments)
      .set({ activeRevisionId })
      .where(eq(sourceDocuments.id, sourceDocumentId));
    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId,
      sourceDocumentRevisionId: activeRevisionId,
      amount: "40.00",
      currency: "CNY",
      itemName: "Missing historical rate",
      convertedAmount: "40.00",
      exchangeRate: "1.000000",
    });

    await expect(
      updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "USD" } })
    ).rejects.toMatchObject({ code: "EXCHANGE_RATES_UNAVAILABLE" });

    const [storedLedger, entries] = await Promise.all([
      db.query.ledgers.findFirst({ where: eq(ledgers.id, ledgerId) }),
      db.query.ledgerEntries.findMany({ where: eq(ledgerEntries.ledgerId, ledgerId) }),
    ]);
    expect(storedLedger?.mainCurrency).toBe("CNY");
    expect(entries.map((entry) => entry.convertedAmount).sort()).toEqual(["40.00", "80.00"]);
    expect(entries.every((entry) => entry.exchangeRate === "1.000000")).toBe(true);
  });
});

describe("settings concurrency invariants", () => {
  it("concurrent main-currency change and first createManual are serialised by the ledger lock", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "settings-race-create-manual");

    for (let i = 0; i < 5; i++) {
      // Run main-currency change and first entry creation concurrently on a fresh ledger.
      const results = await Promise.allSettled([
        updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "USD" } }),
        postgresLedgerProjectionAdapter.createManual({
          ledgerId,
          entryDate: "2026-07-15",
          entries: [
            {
              categoryId: null,
              amount: "80.00",
              currency: "CNY",
              itemName: "Race entry",
              description: null,
              convertedAmount: "80.00",
              exchangeRate: "1.000000",
            },
          ],
        }),
      ]);

      // The lock serialises operations: either settings changes first (then entries are
      // created with the new currency) or entries are created first (then settings throws).
      // Neither deadlock should occur.
      const ledger = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
      });
      const activeEntries = await db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
      });

      // Invariant: if entries were created, settings either succeeded before entry creation
      // or threw because entries already existed. The ledger lock ensures no interleaving.
      // In either case, the ledger row is intact and readable.
      expect(ledger).not.toBeNull();

      // Verify main-currency/entry consistency invariant.
      const [settingsResult, createResult] = results;
      const mainCurrency = ledger?.mainCurrency;

      if (createResult.status === "fulfilled") {
        // Entries were created — either settings ran first (changed currency) and entries
        // followed, or entries ran first and settings was rejected.
        if (settingsResult.status === "fulfilled" && settingsResult.value != null) {
          // Settings succeeded: must have run before entries, so mainCurrency is "USD"
          expect(mainCurrency).toBe("USD");
          // Entries use the currency they were created with (CNY), which may differ from
          // the new main currency — this is an expected edge-case when settings changes
          // before the first entry is created.
          expect(activeEntries.length).toBeGreaterThan(0);
          expect(activeEntries.every((e) => e.currency === "CNY")).toBe(true);
        } else {
          // Settings was rejected: entries existed first, so mainCurrency stays at its default.
          expect(mainCurrency).toBe("CNY");
          expect(activeEntries.length).toBeGreaterThan(0);
        }
      } else if (settingsResult.status === "fulfilled" && settingsResult.value != null) {
        // Only settings succeeded, no entries created — mainCurrency is "USD".
        expect(mainCurrency).toBe("USD");
        expect(activeEntries).toHaveLength(0);
      }

      // Clean up for next iteration
      if (createResult.status === "fulfilled") {
        await db.transaction(async (tx) => {
          await tx
            .update(sourceDocuments)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(sourceDocuments.ledgerId, ledgerId));
          await tx
            .update(ledgerEntries)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(ledgerEntries.ledgerId, ledgerId));
        });
      }
      // Reset main currency if it was changed
      if (settingsResult.status === "fulfilled" && settingsResult.value != null) {
        await db.update(ledgers).set({ mainCurrency: "CNY" }).where(eq(ledgers.id, ledgerId));
      }
    }
  });

  it("concurrent main-currency change and first activateRevision are serialised by the ledger lock", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "settings-race-activate-revision");

    for (let i = 0; i < 5; i++) {
      // Create a pending revision first (this creates the document but not the active projection).
      const sourceDocumentId = crypto.randomUUID();
      await db
        .insert(sourceDocuments)
        .values({ id: sourceDocumentId, ledgerId, type: "ai_parsed" })
        .returning()
        .then((rows) => rows[0]!);

      const { revision } = await db.transaction(async (tx) => {
        const { createPendingRevisionInTransaction: createPending } =
          await import("@/application/adapters/postgres/revisions");
        return createPending(tx, {
          ledgerId,
          sourceDocumentId,
          submittedText: "Race test",
        });
      });

      // Run main-currency change and activateRevision concurrently.
      const results = await Promise.allSettled([
        updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "USD" } }),
        postgresLedgerProjectionAdapter.activateRevision({
          ledgerId,
          sourceDocumentId,
          revisionId: revision.id,
          entries: [
            {
              categoryId: null,
              amount: "80.00",
              currency: "CNY",
              itemName: "Race entry",
              description: null,
              convertedAmount: "80.00",
              exchangeRate: "1.000000",
            },
          ],
        }),
      ]);

      // The lock serialises the two operations — no deadlock, no partial state.
      const ledger = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
      });
      const activeEntries = await db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
      });
      expect(ledger).not.toBeNull();

      // Verify main-currency/entry consistency invariant.
      const [settingsResult, activateResult] = results;
      const mainCurrency = ledger?.mainCurrency;

      if (activateResult.status === "fulfilled" && activateResult.value === true) {
        // activateRevision succeeded — entries were created.
        if (settingsResult.status === "fulfilled" && settingsResult.value != null) {
          // Settings succeeded: must have run before activate, so mainCurrency is "USD"
          expect(mainCurrency).toBe("USD");
          expect(activeEntries.length).toBeGreaterThan(0);
          expect(activeEntries.every((e) => e.currency === "CNY")).toBe(true);
        } else {
          // Settings was rejected: entries existed first, mainCurrency unchanged.
          expect(mainCurrency).toBe("CNY");
          expect(activeEntries.length).toBeGreaterThan(0);
        }
      } else if (settingsResult.status === "fulfilled" && settingsResult.value != null) {
        // Only settings succeeded — no entries created.
        expect(mainCurrency).toBe("USD");
        expect(activeEntries).toHaveLength(0);
      }

      // Clean up
      if (activateResult.status === "fulfilled" && activateResult.value === true) {
        await db.transaction(async (tx) => {
          await tx
            .update(sourceDocuments)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(sourceDocuments.ledgerId, ledgerId));
          await tx
            .update(ledgerEntries)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(ledgerEntries.ledgerId, ledgerId));
        });
      }
      if (settingsResult.status === "fulfilled" && settingsResult.value != null) {
        await db.update(ledgers).set({ mainCurrency: "CNY" }).where(eq(ledgers.id, ledgerId));
      }
    }
  });
});
