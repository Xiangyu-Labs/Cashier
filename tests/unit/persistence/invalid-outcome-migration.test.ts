import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "src/persistence/postgres-migrations/0036_hard_the_fury.sql",
  "utf8"
);

describe("invalid outcome migration", () => {
  it("renames every anomaly enum value and preserves the reason column", () => {
    for (const enumName of [
      "source_document_status",
      "processing_attempt_status",
      "retry_classification",
      "revision_outcome",
    ]) {
      expect(migration).toContain(`ALTER TYPE "${enumName}" RENAME VALUE 'anomaly' TO 'invalid'`);
    }

    expect(migration).toContain('RENAME COLUMN "anomaly_reason" TO "invalid_reason"');
    expect(migration).not.toContain("DROP TYPE");
    expect(migration).not.toContain("DROP COLUMN");
  });
});
