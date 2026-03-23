import { sql, type SQL } from "drizzle-orm";
import { sourceDocuments } from "@/persistence";

export function buildSourceDocumentAmountConditions(
  ledgerId: string,
  minAmount: number | undefined,
  maxAmount: number | undefined
): SQL<unknown>[] {
  if (minAmount === undefined && maxAmount === undefined) {
    return [];
  }

  const totalAmountSql = sql<number>`COALESCE((
    SELECT SUM(ABS(CAST(COALESCE(converted_amount, amount) AS REAL)))
    FROM ledger_entries
    WHERE ledger_id = ${ledgerId}
      AND source_document_id = ${sourceDocuments.id}
      AND deleted_at IS NULL
  ), 0)`;

  const conditions: SQL<unknown>[] = [];
  if (minAmount !== undefined) {
    conditions.push(sql`${totalAmountSql} >= ${minAmount}`);
  }
  if (maxAmount !== undefined) {
    conditions.push(sql`${totalAmountSql} <= ${maxAmount}`);
  }

  return conditions;
}
