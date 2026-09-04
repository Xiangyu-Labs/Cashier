import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import { ledgerEntries, sourceDocuments } from "@/persistence";

const projectionEntry = {
  categoryId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "Lunch",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1.000000",
} as const;

describe("current-runtime target adapters", () => {
  it("creates and edits manual projections, recalculates atomically, and soft deletes", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const created = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
      ledgerId,
      title: "Manual",
      entryDate: "2026-07-15",
      entries: [projectionEntry],
    });
    const originalEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId),
    });
    expect(originalEntry).toBeDefined();

    const replacementRevisionId = await postgresLedgerProjectionAdapter.replaceManual({
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      title: "Edited",
      entries: [{ ...projectionEntry, amount: "18.00" }],
    });
    const replacementEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentRevisionId, replacementRevisionId),
    });
    expect(replacementEntry?.amount).toBe("18.000");
    expect(
      (await db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, originalEntry!.id) }))
        ?.deletedAt
    ).not.toBeNull();

    const beforeRecalculation = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });

    await expect(
      postgresLedgerProjectionAdapter.recalculate({
        ledgerId,
        updates: [
          {
            ledgerEntryId: replacementEntry!.id,
            convertedAmount: "2.50",
            exchangeRate: "0.138889",
          },
        ],
      })
    ).resolves.toBe(1);
    const afterRecalculation = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(afterRecalculation?.stateVersion).toBe(beforeRecalculation!.stateVersion + 1);
    expect(afterRecalculation!.updatedAt.getTime()).toBeGreaterThan(
      beforeRecalculation!.updatedAt.getTime()
    );

    await expect(
      postgresLedgerProjectionAdapter.recalculate({
        ledgerId,
        updates: [
          {
            ledgerEntryId: replacementEntry!.id,
            convertedAmount: "2.50",
            exchangeRate: "0.138889",
          },
        ],
      })
    ).resolves.toBe(0);
    const afterNoopRecalculation = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(afterNoopRecalculation?.stateVersion).toBe(afterRecalculation?.stateVersion);
    expect(afterNoopRecalculation?.updatedAt).toEqual(afterRecalculation?.updatedAt);

    await expect(
      postgresLedgerProjectionAdapter.softDelete(ledgerId, created.sourceDocumentId)
    ).resolves.toBe(true);
    const deleted = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(deleted).toMatchObject({ currentStatus: "cancelled", deletedAt: expect.any(Date) });
    expect(
      (
        await db.query.ledgerEntries.findFirst({
          where: eq(ledgerEntries.id, replacementEntry!.id),
        })
      )?.deletedAt
    ).not.toBeNull();
  });
});
