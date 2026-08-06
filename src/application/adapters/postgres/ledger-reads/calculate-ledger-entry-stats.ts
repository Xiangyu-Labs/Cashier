import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";
import {
  buildLedgerEntryEffectiveDateConditions,
  buildLedgerEntryValueConditions,
} from "./build-ledger-entry-filters";
import type { LedgerEntryFilterParams } from "@/modules/ledger/filters";
import type { LedgerEntrySummary } from "@/modules/ledger/contracts";
import { normalize as decimalNormalize } from "@/lib/money/decimal";

// Single-statement aggregate implementation. The visible_entries CTE scans the
// active projection once and every aggregate branch (currency totals, trend,
// converted total, unconverted count, main currency) reads from that one scan,
// so the summary never fans out across parallel queries.

interface CalculateLedgerEntryStatsInput {
  ledgerId: string;
  filters: LedgerEntryFilterParams;
  mainCurrency?: string;
}

interface StatsRow {
  kind: "currency" | "trend" | "converted" | "unconverted";
  currency: string | null;
  total: string | null;
  count: number | null;
  date: string | null;
  main_currency: string | null;
}

function joinConditions(conditions: ReturnType<typeof buildLedgerEntryValueConditions>) {
  return conditions.length === 0 ? sql`` : sql`AND ${sql.join(conditions, sql` AND `)}`;
}

export async function calculateLedgerEntryStats({
  ledgerId,
  filters,
  mainCurrency,
}: CalculateLedgerEntryStatsInput): Promise<LedgerEntrySummary> {
  const tenantCondition = forLedger(ledgerEntries, ledgerId).whereActive;
  const valueConditions = joinConditions(buildLedgerEntryValueConditions(filters));
  const dateConditions = joinConditions(buildLedgerEntryEffectiveDateConditions(filters));

  const result = await db.execute<StatsRow & Record<string, unknown>>(sql`
    WITH visible_entries AS (
      SELECT
        ledger_entries.currency,
        ledger_entries.amount,
        ledger_entries.converted_amount,
        documents.effective_date
      FROM ledger_entries
      INNER JOIN source_documents documents
        ON documents.ledger_id = ledger_entries.ledger_id
       AND documents.id = ledger_entries.source_document_id
       AND documents.deleted_at IS NULL
       AND documents.active_revision_id = ledger_entries.source_document_revision_id
      WHERE ${tenantCondition}
        ${dateConditions}
        ${valueConditions}
    ),
    currency_totals AS (
      SELECT currency, sum(amount)::text AS total, count(*)::int AS count
      FROM visible_entries
      GROUP BY currency
    ),
    trend AS (
      SELECT effective_date::text AS date, sum(converted_amount)::text AS total
      FROM visible_entries
      GROUP BY effective_date
    ),
    converted_total AS (
      SELECT coalesce(sum(converted_amount), 0)::text AS total
      FROM visible_entries
    ),
    unconverted AS (
      SELECT count(*) FILTER (WHERE converted_amount IS NULL)::int AS count
      FROM visible_entries
    ),
    settings AS (
      SELECT main_currency FROM ledgers WHERE id = ${ledgerId} AND deleted_at IS NULL
    )
    SELECT 'currency' AS kind, currency, total, count, NULL::text AS date,
      NULL::text AS main_currency
    FROM currency_totals
    UNION ALL
    SELECT 'trend' AS kind, NULL, total, NULL, date, NULL
    FROM trend
    UNION ALL
    SELECT 'converted' AS kind, NULL, total, NULL, NULL, main_currency
    FROM settings CROSS JOIN converted_total
    UNION ALL
    SELECT 'unconverted' AS kind, NULL, NULL, count, NULL, NULL
    FROM unconverted
  `);

  const totals = result.rows
    .filter((row) => row.kind === "currency")
    .map((row) => ({
      currency: row.currency ?? "CNY",
      total: decimalNormalize(String(row.total ?? "0")),
      count: Number(row.count) ?? 0,
    }));

  const trend = result.rows
    .filter((row) => row.kind === "trend")
    .filter((row) => row.date != null && row.date !== "")
    .map((row) => ({
      date: row.date ?? "",
      total: decimalNormalize(String(row.total ?? "0")),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const convertedRow = result.rows.find((row) => row.kind === "converted");
  const unconvertedRow = result.rows.find((row) => row.kind === "unconverted");
  const effectiveMainCurrency = mainCurrency ?? convertedRow?.main_currency ?? "CNY";

  return {
    unconvertedCount: Number(unconvertedRow?.count ?? 0),
    convertedTotal: {
      total: decimalNormalize(String(convertedRow?.total ?? "0")),
      currency: effectiveMainCurrency,
    },
    totals,
    trend,
    byCategory: [],
  };
}
