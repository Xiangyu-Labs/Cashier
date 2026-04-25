import { and, desc, gte, lt, sql } from "drizzle-orm";
import type { like } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminCurrencyRatesInput } from "@/modules/admin/contract-schemas";
import type {
  AdminCurrencyRateListItem,
  ListAdminCurrencyRatesInput,
  ListAdminCurrencyRatesResult,
} from "@/modules/admin/contracts";
import { currencyRates } from "@/persistence";

function parseCurrencyRateCursor(cursor: string): { date: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin currency rate cursor", path: ["cursor"] }],
    });
  }
  return { date: cursor };
}

export async function listAdminCurrencyRates(
  input: ListAdminCurrencyRatesInput = {}
): Promise<ListAdminCurrencyRatesResult> {
  await requireSuperAdmin();

  const validated = parseListAdminCurrencyRatesInput(input);
  const conditions: (ReturnType<typeof like> | ReturnType<typeof gte> | ReturnType<typeof lt>)[] = [];
  const parsedCursor = validated.cursor != null ? parseCurrencyRateCursor(validated.cursor) : null;

  if (validated.range !== "all") {
    const now = new Date();
    const days = validated.range === "24h" ? 1 : validated.range === "7d" ? 7 : 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    conditions.push(gte(currencyRates.date, cutoffStr));
  }

  if (parsedCursor != null) {
    conditions.push(lt(currencyRates.date, parsedCursor.date));
  }

  const rows = await db
    .select({
      date: currencyRates.date,
      base: currencyRates.base,
      rates: currencyRates.rates,
      updatedAt: currencyRates.updatedAt,
    })
    .from(currencyRates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(currencyRates.date))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = lastItem.date;
    }
  }

  const anyRateRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(currencyRates);

  const items: AdminCurrencyRateListItem[] = pageRows.map((row) => ({
    date: row.date,
    base: row.base,
    rateCount: Object.keys(row.rates ?? {}).length,
    updatedAt: row.updatedAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyCurrencyRates: (anyRateRows[0]?.count ?? 0) > 0,
  };
}
