import { describe, it, expect, beforeEach } from "vitest";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getTestDb } from "../../../setup";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import type { LedgerProjectionEntryContract } from "@/application/contracts";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";
import {
  ledgerEntries,
  ledgerSyncState,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";

type TestDatabase = ReturnType<typeof getTestDb>;

function entry(
  itemName: string,
  overrides: Partial<LedgerProjectionEntryContract> = {}
): LedgerProjectionEntryContract {
  return {
    categoryId: null,
    amount: "10.00",
    currency: "CNY",
    itemName,
    description: null,
    convertedAmount: "10.00",
    exchangeRate: "1.000000",
    ...overrides,
  };
}

// Statement-level triggers count how many SQL statements mutate a table. The
// counters run inside the same transaction as the write under test, so they
// measure statement count (not row count) regardless of batch size.
async function installStatementCounters(
  db: TestDatabase,
  counters: Array<{ table: string; operation: "INSERT" | "UPDATE"; name: string }>
) {
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS statement_counters (
    name text PRIMARY KEY,
    value integer NOT NULL DEFAULT 0
  )`)
  );
  for (const counter of counters) {
    const functionName = `bump_statement_counter_${counter.name}`;
    const triggerName = `trg_count_${counter.name}`;
    await db.execute(
      sql.raw(`CREATE OR REPLACE FUNCTION ${functionName}()
        RETURNS trigger LANGUAGE plpgsql AS $fn$
        BEGIN
          UPDATE statement_counters SET value = value + 1 WHERE name = '${counter.name}';
          RETURN NULL;
        END $fn$`)
    );
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${counter.table}`));
    await db.execute(
      sql.raw(`CREATE TRIGGER ${triggerName}
        AFTER ${counter.operation} ON ${counter.table}
        FOR EACH STATEMENT EXECUTE FUNCTION ${functionName}()`)
    );
    await db.execute(
      sql.raw(`INSERT INTO statement_counters (name, value)
        VALUES ('${counter.name}', 0)
        ON CONFLICT (name) DO UPDATE SET value = 0`)
    );
  }
}

async function readStatementCounter(db: TestDatabase, name: string): Promise<number> {
  const rows = await db.execute<{ value: number }>(
    sql`SELECT value FROM statement_counters WHERE name = ${name}`
  );
  return rows.rows[0]?.value ?? 0;
}

describe("projection write shape", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const { ledgerId: createdLedgerId } = await createTestUserWithLedger(getTestDb());
    ledgerId = createdLedgerId;
  });

  it("inserts 1, 50 and 500 projection entries with one statement each", async () => {
    const db = getTestDb();
    await installStatementCounters(db, [
      { table: "ledger_entries", operation: "INSERT", name: "ledger_entries_insert" },
    ]);

    for (const count of [1, 50, 500]) {
      const created = await postgresLedgerProjectionAdapter.createManual({
        ledgerId,
        title: `Doc ${count}`,
        entries: Array.from({ length: count }, (_, index) =>
          entry(`Item ${index}`, { amount: String(index + 1) })
        ),
      });

      expect(await readStatementCounter(db, "ledger_entries_insert")).toBe(1);
      const rows = await db
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            eq(ledgerEntries.sourceDocumentId, created.sourceDocumentId),
            isNull(ledgerEntries.deletedAt)
          )
        );
      expect(rows).toHaveLength(count);
      await db.execute(
        sql.raw(`UPDATE statement_counters SET value = 0 WHERE name = 'ledger_entries_insert'`)
      );
    }
  });

  it("copies revision files in one statement and preserves the historical revision", async () => {
    const db = getTestDb();
    const created = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "With file",
      entries: [entry("A"), entry("B")],
    });
    const file = (
      await db
        .insert(storedFiles)
        .values({
          ledgerId,
          storageProvider: "local",
          storageKey: `tests/${created.sourceDocumentId}/0`,
          contentType: "image/jpeg",
          byteSize: 100,
          finalizedAt: new Date(),
        })
        .returning()
    )[0];
    if (file == null) throw new Error("Expected stored file insert to return a row");
    await db.insert(revisionFiles).values({
      ledgerId,
      revisionId: created.revisionId,
      storedFileId: file.id,
      position: 0,
    });
    await installStatementCounters(db, [
      { table: "revision_files", operation: "INSERT", name: "revision_files_insert" },
    ]);

    const replacedRevisionId = await postgresLedgerProjectionAdapter.replaceActive({
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      expectedActiveRevisionId: created.revisionId,
      entries: [entry("A2"), entry("B2"), entry("C")],
    });

    expect(await readStatementCounter(db, "revision_files_insert")).toBe(1);
    const document = (
      await db
        .select()
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, created.sourceDocumentId))
    )[0];
    expect(document?.activeRevisionId).toBe(replacedRevisionId);

    // The copied file keeps its position on the new revision.
    const copiedFiles = await db
      .select({ position: revisionFiles.position })
      .from(revisionFiles)
      .where(
        and(
          eq(revisionFiles.revisionId, replacedRevisionId),
          eq(revisionFiles.storedFileId, file.id)
        )
      );
    expect(copiedFiles).toHaveLength(1);
    expect(copiedFiles[0]?.position).toBe(0);

    // The old revision stays completed with its entries and file intact.
    const oldRevision = (
      await db
        .select()
        .from(sourceDocumentRevisions)
        .where(eq(sourceDocumentRevisions.id, created.revisionId))
    )[0];
    expect(oldRevision?.outcome).toBe("completed");
    const oldFiles = await db
      .select({ id: revisionFiles.id })
      .from(revisionFiles)
      .where(eq(revisionFiles.revisionId, created.revisionId));
    expect(oldFiles).toHaveLength(1);
    const oldEntries = await db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId));
    expect(oldEntries).toHaveLength(2);
    const newEntries = await db
      .select({ position: ledgerEntries.position, itemName: ledgerEntries.itemName })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.sourceDocumentRevisionId, replacedRevisionId),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .orderBy(ledgerEntries.position);
    expect(newEntries.map((row) => row.itemName)).toEqual(["A2", "B2", "C"]);
  });

  it("preserves entry identity, order, history and change-log version on manual replace", async () => {
    const db = getTestDb();
    const pinnedCreatedAt = new Date("2026-01-02T03:04:05.000Z");
    const created = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Manual",
      entryDate: "2026-05-01",
      entries: [
        entry("One", { id: "11111111-1111-4111-8111-111111111111" }),
        entry("Two", {
          id: "22222222-2222-4222-8222-222222222222",
          createdAt: pinnedCreatedAt.toISOString(),
        }),
        entry("Three", { id: "33333333-3333-4333-8333-333333333333" }),
      ],
    });
    const originalRows = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId)
        )
      );
    const originalById = new Map(originalRows.map((row) => [row.id, row]));
    const versionAfterCreate = (
      await db
        .select({ version: ledgerSyncState.version })
        .from(ledgerSyncState)
        .where(eq(ledgerSyncState.ledgerId, ledgerId))
    )[0]?.version;
    await installStatementCounters(db, [
      { table: "ledger_entries", operation: "INSERT", name: "ledger_entries_insert" },
      { table: "ledger_entries", operation: "UPDATE", name: "ledger_entries_update" },
    ]);

    const replacedRevisionId = await postgresLedgerProjectionAdapter.replaceManual({
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      expectedActiveRevisionId: created.revisionId,
      title: "Manual v2",
      entries: [
        entry("New", { id: "44444444-4444-4444-8444-444444444444" }),
        entry("One updated", { id: "11111111-1111-4111-8111-111111111111" }),
        entry("Three updated", { id: "33333333-3333-4333-8333-333333333333" }),
      ],
    });

    // Constant statement count regardless of the entry count: two inserts
    // (archived copy + new entry) and three updates (retained, removed,
    // existing-in-input).
    expect(await readStatementCounter(db, "ledger_entries_insert")).toBe(2);
    expect(await readStatementCounter(db, "ledger_entries_update")).toBe(3);

    // New active projection: input order, retained ids and created_at intact.
    const activeRows = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.sourceDocumentRevisionId, replacedRevisionId),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .orderBy(ledgerEntries.position);
    expect(activeRows.map((row) => row.itemName)).toEqual(["New", "One updated", "Three updated"]);
    for (const row of activeRows) {
      if (row.id === "44444444-4444-4444-8444-444444444444") continue;
      const original = originalById.get(row.id);
      expect(original, `expected original row for ${row.id}`).toBeDefined();
      expect(row.createdAt.getTime()).toBe(original!.createdAt.getTime());
    }

    // Historical rows keep the old revision: one archived copy per retained
    // entry plus the removed entry, all soft-deleted.
    const historyRows = await db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId),
          isNotNull(ledgerEntries.deletedAt)
        )
      );
    expect(historyRows).toHaveLength(3);
    expect(historyRows.map((row) => row.itemName).sort()).toEqual(["One", "Three", "Two"]);
    const removedTwo = historyRows.find((row) => row.itemName === "Two");
    expect(removedTwo?.createdAt.getTime()).toBe(pinnedCreatedAt.getTime());
    expect(removedTwo?.id).toBe("22222222-2222-4222-8222-222222222222");
    for (const archived of historyRows.filter((historyRow) => historyRow.id !== removedTwo?.id)) {
      const original = [...originalById.values()].find((row) => row.itemName === archived.itemName);
      // Archived copies get fresh ids but preserve the original row values.
      expect(original, `expected original row for ${archived.itemName}`).toBeDefined();
      expect(archived.id).not.toBe(original!.id);
      expect(archived.createdAt.getTime()).toBe(original!.createdAt.getTime());
      expect(archived.amount).toBe(original!.amount);
    }

    // The change-log trigger aggregates by transaction: exactly one version
    // bump for the whole replace.
    const versionAfterReplace = (
      await db
        .select({ version: ledgerSyncState.version })
        .from(ledgerSyncState)
        .where(eq(ledgerSyncState.ledgerId, ledgerId))
    )[0]?.version;
    expect(Number(versionAfterReplace)).toBe(Number(versionAfterCreate) + 1);
  });
});
