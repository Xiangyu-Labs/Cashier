import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { AppError, ConflictError } from "@/lib/errors";
import {
  currencyRates,
  entryCategories,
  ledgerEntries,
  ledgers,
  sourceDocuments,
} from "@/persistence";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";

/** lastUsedAt updates are throttled to once per five minutes per credential. */
export const SERVICE_CREDENTIAL_LAST_USED_STALE_MS = 5 * 60 * 1000;

export function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function mapLedgerSettings(row: typeof ledgers.$inferSelect) {
  return {
    aiLanguage: row.aiLanguage,
    currencies: row.preferredCurrencies,
    mainCurrency: row.mainCurrency,
    collapseEntriesDefault: row.collapseEntriesDefault,
    aiCustomPrompt: row.aiCustomPrompt,
    duplicateDetectionEnabled: row.duplicateDetectionEnabled,
    timeZone: row.timeZone,
  };
}

export function settingsColumns(
  settings: Partial<import("@/application/contracts").LedgerSettingsContract>
) {
  return {
    ...(settings.aiLanguage === undefined ? {} : { aiLanguage: settings.aiLanguage }),
    ...(settings.currencies === undefined ? {} : { preferredCurrencies: settings.currencies }),
    ...(settings.mainCurrency === undefined ? {} : { mainCurrency: settings.mainCurrency }),
    ...(settings.collapseEntriesDefault === undefined
      ? {}
      : { collapseEntriesDefault: settings.collapseEntriesDefault }),
    ...(settings.aiCustomPrompt === undefined ? {} : { aiCustomPrompt: settings.aiCustomPrompt }),
    ...(settings.duplicateDetectionEnabled === undefined
      ? {}
      : { duplicateDetectionEnabled: settings.duplicateDetectionEnabled }),
    ...(settings.timeZone === undefined ? {} : { timeZone: settings.timeZone }),
  };
}

export function mapCategory(row: typeof entryCategories.$inferSelect) {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type PostgresTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recalculateCurrentEntries(
  tx: PostgresTransaction,
  ledgerId: string,
  mainCurrency: string,
  entryDate?: string,
  includeUndated = false
): Promise<number> {
  const entries = await tx
    .select({
      id: ledgerEntries.id,
      currency: ledgerEntries.currency,
      entryDate: sourceDocuments.entryDate,
    })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        or(
          eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
          eq(sourceDocuments.pendingRevisionId, ledgerEntries.sourceDocumentRevisionId)
        ),
        isNull(sourceDocuments.deletedAt),
        ...(entryDate != null
          ? [
              includeUndated
                ? or(eq(sourceDocuments.entryDate, entryDate), isNull(sourceDocuments.entryDate))
                : eq(sourceDocuments.entryDate, entryDate),
            ]
          : [])
      )
    )
    .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)));
  if (entries.length === 0) return 0;
  const currencies = new Set(
    entries.map((entry) => (entry.currency ?? mainCurrency).trim().toUpperCase())
  );
  for (const currency of currencies) {
    if (!SUPPORTED_CURRENCIES.includes(currency as (typeof SUPPORTED_CURRENCIES)[number])) {
      throw new AppError(`Currency not found: ${currency}`, "CURRENCY_NOT_FOUND", 400);
    }
  }

  const requiredDates = [
    ...new Set(entries.flatMap((entry) => (entry.entryDate == null ? [] : [entry.entryDate]))),
  ];
  const datedRates =
    requiredDates.length === 0
      ? []
      : await tx.select().from(currencyRates).where(inArray(currencyRates.date, requiredDates));
  const latestRate =
    entries.some((entry) => entry.entryDate == null) || requiredDates.length === 0
      ? await tx
          .select()
          .from(currencyRates)
          .orderBy(desc(currencyRates.date))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;
  const ratesByDate = new Map(datedRates.map((rate) => [rate.date, rate]));
  for (const entry of entries) {
    const sourceCurrency = (entry.currency ?? mainCurrency).trim().toUpperCase();
    if (sourceCurrency === mainCurrency) continue;
    const rate = entry.entryDate == null ? latestRate : ratesByDate.get(entry.entryDate);
    if (rate == null) {
      throw new AppError(
        "No stored currency rates are available",
        "EXCHANGE_RATES_UNAVAILABLE",
        409
      );
    }
    const fullRates = { ...rate.rates, [rate.base]: 1 };
    if (fullRates[sourceCurrency] == null || fullRates[mainCurrency] == null) {
      const missing = fullRates[sourceCurrency] == null ? sourceCurrency : mainCurrency;
      throw new AppError(`Currency not found: ${missing}`, "CURRENCY_NOT_FOUND", 400);
    }
  }

  const decimals =
    mainCurrency === "JPY" || mainCurrency === "KRW"
      ? 0
      : ["BHD", "JOD", "KWD", "OMR", "TND"].includes(mainCurrency)
        ? 3
        : 2;
  const updated = await tx.execute(sql`
    WITH candidates AS (
      SELECT
        entry.id,
        entry.amount::numeric AS amount,
        COALESCE(entry.currency, ${mainCurrency}) AS source_currency,
        rates.base AS rate_base,
        rates.rates AS rate_values
      FROM ledger_entries AS entry
      INNER JOIN source_documents AS document
        ON document.id = entry.source_document_id
        AND document.ledger_id = ${ledgerId}
        AND (
          document.active_revision_id = entry.source_document_revision_id
          OR document.pending_revision_id = entry.source_document_revision_id
        )
        AND document.deleted_at IS NULL
        ${
          entryDate != null
            ? sql`AND (
              ${
                includeUndated
                  ? sql`document.entry_date = ${entryDate} OR document.entry_date IS NULL`
                  : sql`document.entry_date = ${entryDate}`
              }
            )`
            : sql``
        }
      LEFT JOIN currency_rates AS rates
        ON rates.date = COALESCE(
          document.entry_date,
          (SELECT MAX(latest.date) FROM currency_rates AS latest)
        )
      WHERE entry.ledger_id = ${ledgerId}
        AND entry.deleted_at IS NULL
    ), ratios AS (
      SELECT
        id,
        amount,
        CASE
          WHEN source_currency = ${mainCurrency} THEN 1::numeric
          ELSE (
            CASE WHEN rate_base = ${mainCurrency} THEN 1::numeric
              ELSE (rate_values ->> ${mainCurrency})::numeric END
          ) / (
            CASE WHEN rate_base = source_currency THEN 1::numeric
              ELSE (rate_values ->> source_currency)::numeric END
          )
        END AS ratio
      FROM candidates
    ), converted AS (
      SELECT
        id,
        ROUND(amount * ratio, ${decimals}) AS converted_amount,
        ROUND(ratio, 12) AS exchange_rate
      FROM ratios
    )
    UPDATE ledger_entries AS entry
    SET converted_amount = converted.converted_amount,
        exchange_rate = converted.exchange_rate,
        updated_at = ${new Date()}
    FROM converted
    WHERE entry.id = converted.id
      AND entry.ledger_id = ${ledgerId}
      AND entry.deleted_at IS NULL
    RETURNING entry.id
  `);
  if (updated.rows.length !== entries.length) {
    throw new ConflictError("Ledger entries changed during currency recalculation");
  }
  return updated.rows.length;
}
