import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sourceDocuments } from "@/persistence";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";

function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${label}`);
  }
  return value;
}

describe("source document deleted-status migration", () => {
  let ledgerId = "";

  beforeEach(async () => {
    const db = getTestDb();
    ({ ledgerId } = await createTestUserWithLedger(db));
  });

  it("backfills deleted status for legacy rows that only have deletedAt", async () => {
    const db = getTestDb();
    const legacyDeletedAt = new Date("2026-03-22T10:00:00.000Z");
    const legacyDoc = requireDefined(
      (
        await db
          .insert(sourceDocuments)
          .values({
            ledgerId,
            text: "legacy deleted doc",
            status: "completed",
            deletedAt: legacyDeletedAt,
            imageUrls: [],
            entryDate: "2026-03-22",
          })
          .returning()
      )[0],
      "legacy source document"
    );

    const migrationSql = readFileSync(
      "src/persistence/migrations/0028_source_document_deleted_status.sql",
      "utf8"
    );

    (db as typeof db & { $client: { exec: (sql: string) => unknown } }).$client.exec(migrationSql);

    const migrated = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, legacyDoc.id),
    });

    expect(migrated?.status).toBe("deleted");
    expect(migrated?.deletedAt?.toISOString()).toBe(legacyDeletedAt.toISOString());
  });
});
