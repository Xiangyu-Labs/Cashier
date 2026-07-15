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
    expect(detail).toMatchObject(stream.items[0]!);
    expect(summary.convertedTotal).toEqual({ total: 12.5, currency: "CNY" });
    expect(enhanced.summary).toMatchObject({ total: 12.5, currency: "CNY" });

    await sqliteLedgerProjectionAdapter.softDelete(ledgerId, created.sourceDocumentId);
    await expect(listLedgerEntries(ledgerId, { limit: 20 })).resolves.toMatchObject({ items: [] });
    await expect(getLedgerEntryDetail(activeEntry!.id, ledgerId)).resolves.toBeNull();
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
});
