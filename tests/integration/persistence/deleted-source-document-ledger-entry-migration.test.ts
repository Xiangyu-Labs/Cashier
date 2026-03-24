import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";

function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${label}`);
  }
  return value;
}

describe("deleted source document ledger entry migration", () => {
  let ledgerId = "";

  beforeEach(async () => {
    const db = getTestDb();
    ({ ledgerId } = await createTestUserWithLedger(db));
  });

  it("soft-deletes active ledger entries linked to deleted source documents", async () => {
    const db = getTestDb();
    const deletedAt = new Date("2026-03-22T10:00:00.000Z");

    const deletedSourceDocument = requireDefined(
      (
        await db
          .insert(sourceDocuments)
          .values({
            ledgerId,
            text: "deleted source document",
            status: "deleted",
            deletedAt,
            imageUrls: [],
            entryDate: "2026-03-22",
          })
          .returning()
      )[0],
      "deleted source document"
    );

    const linkedActiveEntry = requireDefined(
      (
        await db
          .insert(ledgerEntries)
          .values({
            ledgerId,
            sourceDocumentId: deletedSourceDocument.id,
            amount: "100",
            currency: "USD",
            itemName: "Active entry under deleted source document",
          })
          .returning()
      )[0],
      "linked active ledger entry"
    );

    const migrationSql = readFileSync(
      "src/persistence/migrations/0029_soft_delete_entries_under_deleted_source_documents.sql",
      "utf8"
    );

    (db as typeof db & { $client: { exec: (sql: string) => unknown } }).$client.exec(migrationSql);

    const migratedEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, linkedActiveEntry.id),
    });

    expect(migratedEntry?.deletedAt?.toISOString()).toBe(deletedAt.toISOString());
  });

  it("soft-deletes active ledger entries when deleted status exists without deletedAt", async () => {
    const db = getTestDb();

    const deletedSourceDocument = requireDefined(
      (
        await db
          .insert(sourceDocuments)
          .values({
            ledgerId,
            text: "status-only deleted source document",
            status: "deleted",
            imageUrls: [],
            entryDate: "2026-03-23",
          })
          .returning()
      )[0],
      "status-only deleted source document"
    );

    const linkedActiveEntry = requireDefined(
      (
        await db
          .insert(ledgerEntries)
          .values({
            ledgerId,
            sourceDocumentId: deletedSourceDocument.id,
            amount: "88",
            currency: "CNY",
            itemName: "Active entry under status-only deleted source document",
          })
          .returning()
      )[0],
      "linked active ledger entry"
    );

    const migrationSql = readFileSync(
      "src/persistence/migrations/0029_soft_delete_entries_under_deleted_source_documents.sql",
      "utf8"
    );

    (db as typeof db & { $client: { exec: (sql: string) => unknown } }).$client.exec(migrationSql);

    const migratedEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.id, linkedActiveEntry.id),
    });

    expect(migratedEntry?.deletedAt).not.toBeNull();
  });
});
