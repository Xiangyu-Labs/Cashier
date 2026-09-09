import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { forLedger } from "@/lib/db/scoped-query";

const dialect = new PgDialect();
const table = pgTable("test_entities", {
  id: text("id").primaryKey(),
  ledgerId: text("ledger_id").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
const tableWithoutSoftDelete = pgTable("active_entities", {
  id: text("id").primaryKey(),
  ledgerId: text("ledger_id").notNull(),
});

function compile(condition: SQL | undefined) {
  if (condition === undefined) throw new Error("Expected a ledger scope condition");
  return dialect.sqlToQuery(condition);
}

describe("forLedger", () => {
  it("scopes active reads by ledger and excludes soft-deleted rows", () => {
    const query = compile(forLedger(table, "ledger-1").whereActive);

    expect(query.sql).toContain('"test_entities"."ledger_id" = $1');
    expect(query.sql).toContain('"test_entities"."deleted_at" is null');
    expect(query.params).toEqual(["ledger-1"]);
  });

  it("scopes entity mutations by both ID and ledger", () => {
    const query = compile(forLedger(table, "ledger-1").whereId("entry-1"));

    expect(query.sql).toContain('"test_entities"."id" = $1');
    expect(query.sql).toContain('"test_entities"."ledger_id" = $2');
    expect(query.params).toEqual(["entry-1", "ledger-1"]);
  });

  it("supports ledger-scoped tables without soft deletion", () => {
    const query = compile(forLedger(tableWithoutSoftDelete, "ledger-1").whereActive);

    expect(query.sql).toContain('"active_entities"."ledger_id" = $1');
    expect(query.sql).not.toContain("deleted_at");
  });
});
