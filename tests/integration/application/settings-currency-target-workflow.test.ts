import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import { updateLedger } from "@/modules/ledger/application/use-cases/update-ledger";
import { hasActiveEntries } from "@/modules/ledger/application/queries/has-active-entries";
import { currencyRates, ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

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
    expect(updated.metadata?.settings?.mainCurrency).toBe("USD");
  });

  it("rejects main currency change when active entries exist", async () => {
    await createEntry();

    await expect(
      updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "USD" } })
    ).rejects.toThrow("Main currency cannot be changed after the first entry");
  });

  it("allows other setting changes when main currency is locked", async () => {
    await createEntry();

    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { aiLanguage: "en" },
    });
    expect(updated.metadata?.settings?.aiLanguage).toBe("en");
    // mainCurrency is not in the initial empty settings, so remains undefined
    expect(updated.metadata?.settings?.mainCurrency).toBeUndefined();
  });

  it("hasActiveEntries returns false for empty ledger", async () => {
    expect(await hasActiveEntries(ledgerId)).toBe(false);
  });

  it("hasActiveEntries returns true after entry creation", async () => {
    await createEntry();
    expect(await hasActiveEntries(ledgerId)).toBe(true);
  });

  it("hasActiveEntries returns false after source document is soft-deleted", async () => {
    await createEntry();
    expect(await hasActiveEntries(ledgerId)).toBe(true);

    // Soft-delete the source document so its entries are no longer active
    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    expect(await hasActiveEntries(ledgerId)).toBe(false);
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
    expect(updated.metadata?.settings?.mainCurrency).toBe("USD");
  });

  it("rejects main currency change with unsupported currency when active entries exist", async () => {
    await createEntry();

    await expect(
      updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "ZZZ" } })
    ).rejects.toThrow("Main currency cannot be changed after the first entry");
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
        where: and(
          eq(ledgerEntries.ledgerId, ledgerId),
          isNull(ledgerEntries.deletedAt)
        ),
      });

      // Invariant: if entries were created, settings either succeeded before entry creation
      // or threw because entries already existed. The ledger lock ensures no interleaving.
      // In either case, the ledger row is intact and readable.
      expect(ledger).not.toBeNull();

      // Verify main-currency/entry consistency invariant.
      const [settingsResult, createResult] = results;
      const mainCurrency = ledger?.metadata?.settings?.mainCurrency;

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
          // Settings was rejected: entries existed first, so mainCurrency must be unchanged.
          expect(mainCurrency).toBeUndefined();
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
        await db
          .update(ledgers)
          .set({ metadata: {} })
          .where(eq(ledgers.id, ledgerId));
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
        const { createPendingRevisionInTransaction: createPending } = await import(
          "@/application/adapters/postgres/revisions"
        );
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
        where: and(
          eq(ledgerEntries.ledgerId, ledgerId),
          isNull(ledgerEntries.deletedAt)
        ),
      });
      expect(ledger).not.toBeNull();

      // Verify main-currency/entry consistency invariant.
      const [settingsResult, activateResult] = results;
      const mainCurrency = ledger?.metadata?.settings?.mainCurrency;

      if (activateResult.status === "fulfilled" && activateResult.value === true) {
        // activateRevision succeeded — entries were created.
        if (settingsResult.status === "fulfilled" && settingsResult.value != null) {
          // Settings succeeded: must have run before activate, so mainCurrency is "USD"
          expect(mainCurrency).toBe("USD");
          expect(activeEntries.length).toBeGreaterThan(0);
          expect(activeEntries.every((e) => e.currency === "CNY")).toBe(true);
        } else {
          // Settings was rejected: entries existed first, mainCurrency unchanged.
          expect(mainCurrency).toBeUndefined();
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
        await db
          .update(ledgers)
          .set({ metadata: {} })
          .where(eq(ledgers.id, ledgerId));
      }
    }
  });
});
