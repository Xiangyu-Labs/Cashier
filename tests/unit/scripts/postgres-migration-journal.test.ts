import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
};

const migrationsDirectory = path.resolve("src/persistence/postgres-migrations");
const journal = JSON.parse(
  readFileSync(path.join(migrationsDirectory, "meta/_journal.json"), "utf8")
) as { entries: JournalEntry[] };

describe("Postgres migration journal", () => {
  it("contains only the documented legacy timestamp inversions", () => {
    const allowedLegacyInversions = new Set(["0010_user_preferences", "0011_little_junta"]);
    const observedInversions = new Set<string>();
    let greatestTimestamp = -Infinity;

    journal.entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      if (entry.when <= greatestTimestamp) {
        observedInversions.add(entry.tag);
        expect(allowedLegacyInversions.has(entry.tag)).toBe(true);
      }
      greatestTimestamp = Math.max(greatestTimestamp, entry.when);
    });

    expect(observedInversions).toEqual(allowedLegacyInversions);
    expect(journal.entries.at(-1)?.tag).toBe("0014_revision_title_transaction");
  });

  it("recovers every schema change skipped by the legacy inversions", () => {
    const sql = readFileSync(
      path.join(migrationsDirectory, "0012_recover_skipped_migrations.sql"),
      "utf8"
    );

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "preferences"');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "ck_processing_attempts_status"');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "ck_processing_outbox_status"');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "ck_source_document_revisions_outcome"');
    expect(sql).toContain("'cancelled'");
    expect(sql).toContain("'abandoned'");
  });
});
