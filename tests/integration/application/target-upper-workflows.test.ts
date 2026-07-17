import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  sqliteLedgerProjectionAdapter,
  sqliteRevisionAdapter,
} from "@/application/adapters/sqlite";
import { getLedgerEntryDetail } from "@/modules/ledger/application/queries/get-ledger-entry-detail";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
import { getEnhancedStatsQuery } from "@/modules/stats/application/queries/get-enhanced-stats";
import { querySourceDocumentPage } from "@/modules/source-document/application/queries/list-source-document-page";
import { updateLedgerEntryWithConversion } from "@/modules/ledger/application/use-cases/mutate-ledger-entries";
import { deleteLedgerEntry } from "@/modules/ledger/application/use-cases/delete-ledger-entry";
import {
  entryCategories,
  ledgerEntries,
  revisionEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

const entry = {
  categoryId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "Lunch",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1.000000",
} as const;

describe("target upper workflows", () => {
  it("derives list state from revision pointers and paginates without skips", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const completed = await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      entryDate: "2026-07-15",
      entries: [entry],
    });
    const pending = await sqliteRevisionAdapter.createPending({
      ledgerId,
      submittedText: "pending",
    });
    await sqliteRevisionAdapter.markProcessing({
      ledgerId,
      sourceDocumentId: pending.document.id,
      revisionId: pending.revision.id,
    });
    await db
      .update(sourceDocuments)
      .set({ status: "failed" })
      .where(eq(sourceDocuments.id, completed.sourceDocumentId));

    const first = await querySourceDocumentPage(ledgerId, { limit: 1 });
    const second = await querySourceDocumentPage(ledgerId, {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(first.nextCursor).not.toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id))).toEqual(
      new Set([completed.sourceDocumentId, pending.document.id])
    );
    expect(
      [...first.items, ...second.items].find((item) => item.id === completed.sourceDocumentId)
        ?.status
    ).toBe("completed");
    expect(
      [...first.items, ...second.items].find((item) => item.id === pending.document.id)?.status
    ).toBe("processing");
  });

  it("keeps Stream, Details, and Stats on the same active projection", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const [category] = await db
      .insert(entryCategories)
      .values({ ledgerId, name: "Food" })
      .returning();
    const created = await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      entryDate: "2026-07-15",
      entries: [{ ...entry, categoryId: category!.id }],
    });
    const activeEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId),
    });
    const failedPending = await sqliteRevisionAdapter.createPending({
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      submittedText: "failed replacement",
    });
    await sqliteRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      revisionId: failedPending.revision.id,
      outcome: "failed",
    });

    const stream = await listLedgerEntries(ledgerId, { limit: 20 });
    const detail = await getLedgerEntryDetail(activeEntry!.id, ledgerId);
    const summary = await calculateLedgerStats(ledgerId, "2026-07-15", "2026-07-15", "CNY");
    const enhanced = await getEnhancedStatsQuery({
      ledgerId,
      queryRange: { from: "2026-07-15", to: "2026-07-15" },
      compareRange: { from: "2026-07-14", to: "2026-07-14" },
    });

    expect(stream.items).toHaveLength(1);
    expect(stream.items[0]).toMatchObject({
      id: activeEntry!.id,
      amount: "12.50",
      currency: "CNY",
      categoryId: category!.id,
    });
    expect(detail).toMatchObject({
      id: activeEntry!.id,
      sourceDocumentId: created.sourceDocumentId,
      amount: stream.items[0]!.amount,
      currency: stream.items[0]!.currency,
      convertedAmount: stream.items[0]!.convertedAmount,
      exchangeRate: stream.items[0]!.exchangeRate,
      categoryId: stream.items[0]!.categoryId,
      sourceDocument: expect.objectContaining({ text: null, status: "completed" }),
    });
    expect(stream.items[0]?.sourceDocument?.text).toBeNull();
    expect(summary.convertedTotal).toEqual({ total: 12.5, currency: "CNY" });
    expect(enhanced.summary).toMatchObject({ total: 12.5, currency: "CNY" });

    await sqliteLedgerProjectionAdapter.softDelete(ledgerId, created.sourceDocumentId);
    await expect(listLedgerEntries(ledgerId, { limit: 20 })).resolves.toMatchObject({ items: [] });
    await expect(getLedgerEntryDetail(activeEntry!.id, ledgerId)).resolves.toBeNull();
  });

  it("preserves decimal adjustments, dates, categories, currencies, and exchange-rate facts atomically", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const [category] = await db
      .insert(entryCategories)
      .values({ ledgerId, name: "Food" })
      .returning();
    const transactionAt = "2026-07-14T12:30:00.000Z";
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] as const;
    const created = await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Receipt with adjustments",
      entryDate: "2026-07-14",
      entries: [
        {
          id: ids[0],
          categoryId: category!.id,
          amount: "12.34",
          currency: "USD",
          itemName: "Meal",
          description: null,
          convertedAmount: "98.72",
          exchangeRate: "8.000000",
          createdAt: transactionAt,
        },
        {
          id: ids[1],
          categoryId: null,
          amount: "-1.11",
          currency: "USD",
          itemName: "Order discount",
          description: "bill-level discount",
          convertedAmount: "-8.88",
          exchangeRate: "8.000000",
          createdAt: transactionAt,
        },
        {
          id: ids[2],
          categoryId: null,
          amount: "0.50",
          currency: "USD",
          itemName: "Service fee",
          description: "bill-level fee",
          convertedAmount: "4.00",
          exchangeRate: "8.000000",
          createdAt: transactionAt,
        },
      ],
    });

    const stream = await listLedgerEntries(ledgerId, { limit: 20 });
    const detail = await getLedgerEntryDetail(ids[0]!, ledgerId);
    const stats = await calculateLedgerStats(ledgerId, "2026-07-14", "2026-07-14", "CNY");
    expect(stream.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ids[0],
          categoryId: category!.id,
          amount: "12.34",
          currency: "USD",
          convertedAmount: "98.72",
          exchangeRate: "8.000000",
          sourceDocument: expect.objectContaining({ entryDate: "2026-07-14" }),
        }),
        expect.objectContaining({ id: ids[1], itemName: "Order discount", amount: "-1.11" }),
        expect.objectContaining({ id: ids[2], itemName: "Service fee", amount: "0.50" }),
      ])
    );
    expect(detail).toMatchObject({
      id: ids[0],
      category: { id: category!.id, name: "Food" },
      amount: "12.34",
      currency: "USD",
      convertedAmount: "98.72",
      exchangeRate: "8.000000",
      sourceDocument: { id: created.sourceDocumentId, entryDate: "2026-07-14" },
    });
    expect(detail?.createdAt).toBe(transactionAt);
    expect(stats.convertedTotal).toEqual({ total: 93.84, currency: "CNY" });
    expect(stats.totals).toContainEqual({ currency: "USD", total: 11.73, count: 3 });

    await expect(
      sqliteLedgerProjectionAdapter.recalculate({
        ledgerId,
        updates: [
          { ledgerEntryId: ids[0]!, convertedAmount: "86.38", exchangeRate: "7.000000" },
          {
            ledgerEntryId: crypto.randomUUID(),
            convertedAmount: "999.00",
            exchangeRate: "999.000000",
          },
        ],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const afterRollback = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, ids[0]!),
    });
    const activeDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    const targetLinks = await db.query.revisionEntries.findMany({
      where: eq(revisionEntries.revisionId, created.revisionId),
    });
    expect(afterRollback).toMatchObject({
      convertedAmount: "98.72",
      exchangeRate: "8.000000",
      sourceDocumentRevisionId: created.revisionId,
    });
    expect(activeDocument?.activeRevisionId).toBe(created.revisionId);
    expect(new Set(targetLinks.map((link) => link.ledgerEntryId))).toEqual(new Set(ids));
  });

  it("prevents cross-workspace reads and rolls back invalid manual replacement", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      crypto.randomUUID()
    );
    const [otherCategory] = await db
      .insert(entryCategories)
      .values({ ledgerId: otherLedgerId, name: "Other" })
      .returning();
    await expect(
      sqliteLedgerProjectionAdapter.createManual({
        ledgerId,
        entries: [{ ...entry, categoryId: otherCategory!.id }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(sourceDocuments)).toHaveLength(0);
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(0);
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
    expect(await db.select().from(revisionEntries)).toHaveLength(0);

    const created = await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      entries: [entry],
    });
    const beforeDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    const beforeRevisionCount = await db.select().from(sourceDocumentRevisions);
    const beforeEntryCount = await db.select().from(ledgerEntries);
    const beforeLinkCount = await db.select().from(revisionEntries);

    await expect(querySourceDocumentPage(otherLedgerId, {})).resolves.toMatchObject({ items: [] });
    await expect(listLedgerEntries(otherLedgerId, { limit: 20 })).resolves.toMatchObject({
      items: [],
    });
    await expect(
      sqliteLedgerProjectionAdapter.replaceManual({
        ledgerId,
        sourceDocumentId: created.sourceDocumentId,
        expectedActiveRevisionId: created.revisionId,
        entries: [{ ...entry, categoryId: otherCategory!.id }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const afterDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(afterDocument?.activeRevisionId).toBe(beforeDocument?.activeRevisionId);
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(
      beforeRevisionCount.length
    );
    expect(await db.select().from(ledgerEntries)).toHaveLength(beforeEntryCount.length);
    expect(await db.select().from(revisionEntries)).toHaveLength(beforeLinkCount.length);
  });

  it("edits a manual entry through an immediate revision while keeping the legacy id", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const created = await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      entryDate: "2026-07-15",
      entries: [entry],
    });
    const original = await db.query.ledgerEntries.findFirst({
      where: and(
        eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId),
        isNull(ledgerEntries.deletedAt)
      ),
    });

    const updated = await updateLedgerEntryWithConversion({
      ledgerId,
      ledgerEntryId: original!.id,
      amount: 18,
    });
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    const revisions = await db.query.sourceDocumentRevisions.findMany({
      where: eq(sourceDocumentRevisions.sourceDocumentId, created.sourceDocumentId),
    });
    const active = await db.query.ledgerEntries.findFirst({
      where: and(eq(ledgerEntries.id, original!.id), isNull(ledgerEntries.deletedAt)),
    });
    const archived = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, created.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId)
      ),
    });

    expect(updated).toMatchObject({ id: original!.id, amount: "18.00" });
    expect(document?.activeRevisionId).not.toBe(created.revisionId);
    expect(revisions).toHaveLength(2);
    expect(active).toMatchObject({ id: original!.id, amount: "18.00" });
    expect(archived).toHaveLength(1);
    expect(archived[0]?.deletedAt).not.toBeNull();
  });

  it("mutates parsed entries through target revisions with rollback and read consistency", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      crypto.randomUUID()
    );
    const [otherCategory] = await db
      .insert(entryCategories)
      .values({ ledgerId: otherLedgerId, name: "Other" })
      .returning();
    const pending = await sqliteRevisionAdapter.createPending({ ledgerId, submittedText: "Lunch" });
    await sqliteLedgerProjectionAdapter.activateRevision({
      ledgerId,
      sourceDocumentId: pending.document.id,
      revisionId: pending.revision.id,
      entries: [entry],
    });
    const original = await db.query.ledgerEntries.findFirst({
      where: and(
        eq(ledgerEntries.sourceDocumentRevisionId, pending.revision.id),
        isNull(ledgerEntries.deletedAt)
      ),
    });

    await updateLedgerEntryWithConversion({
      ledgerId,
      ledgerEntryId: original!.id,
      amount: 18,
    });
    const afterUpdate = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.document.id),
    });
    const revisionCount = (await db.select().from(sourceDocumentRevisions)).length;
    const stream = await listLedgerEntries(ledgerId, { limit: 20 });
    const detail = await getLedgerEntryDetail(original!.id, ledgerId);
    const stats = await calculateLedgerStats(ledgerId, undefined, undefined, "CNY");
    expect(stream.items[0]).toMatchObject({ id: original!.id, amount: "18.00" });
    expect(detail).toMatchObject({ id: original!.id, amount: "18.00" });
    expect(stats.convertedTotal).toEqual({ total: 18, currency: "CNY" });

    await expect(
      updateLedgerEntryWithConversion({
        ledgerId,
        ledgerEntryId: original!.id,
        categoryId: otherCategory!.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const afterRollback = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.document.id),
    });
    expect(afterRollback?.activeRevisionId).toBe(afterUpdate?.activeRevisionId);
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(revisionCount);
    await expect(
      updateLedgerEntryWithConversion({
        ledgerId: otherLedgerId,
        ledgerEntryId: original!.id,
        amount: 99,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(deleteLedgerEntry(ledgerId, original!.id)).resolves.toEqual({
      ledgerEntryId: original!.id,
      deleted: true,
    });
    await expect(listLedgerEntries(ledgerId, { limit: 20 })).resolves.toMatchObject({ items: [] });
    await expect(getLedgerEntryDetail(original!.id, ledgerId)).resolves.toBeNull();
    await expect(
      calculateLedgerStats(ledgerId, undefined, undefined, "CNY")
    ).resolves.toMatchObject({
      convertedTotal: { total: 0, currency: "CNY" },
    });
  });
});
