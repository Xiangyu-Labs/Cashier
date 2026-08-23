import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type {
  AuthenticationPort,
  CategoryPort,
  CurrencyPort,
  LedgerPort,
  ServiceCredentialPort,
  SettingsPort,
  OtpTokenPort,
  UserAccountPort,
  UserPreferencesPort,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { AppError, ConflictError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/error-handlers";
import { multiply, isValidDecimal } from "@/lib/money/decimal";
import {
  currencyRates,
  entryCategories,
  ledgerEntries,
  ledgers,
  objectCleanupJobs,
  otpTokens,
  processingAttempts,
  processingOutbox,
  duplicateReviews,
  revisionFiles,
  serviceCredentials,
  sourceDocuments,
  sourceDocumentRevisions,
  storedFiles,
  uploadSessionFiles,
  users,
} from "@/persistence";
import { createToken, computeHash } from "@/lib/security/service-credential-token";
import { lockLedgerForUpdate } from "./transaction-locks";
import {
  convertWithRates,
  resolveRateRatio,
} from "@/modules/currency/application/services/rate-calculation";
import { roundToCurrency } from "@/lib/money/currency-precision";
import { normalizeUserPreferences } from "@/modules/auth/services/user-preferences";

/** lastUsedAt updates are throttled to once per five minutes per credential. */
const SERVICE_CREDENTIAL_LAST_USED_STALE_MS = 5 * 60 * 1000;

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function mapLedgerSettings(row: typeof ledgers.$inferSelect) {
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

function settingsColumns(
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

function mapCategory(row: typeof entryCategories.$inferSelect) {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isEditable: row.isEditable,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type PostgresTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function recalculateCurrentEntries(
  tx: PostgresTransaction,
  ledgerId: string,
  mainCurrency: string,
  entryDate?: string,
  includeUndated = false
): Promise<number> {
  const entries = await tx
    .select({
      id: ledgerEntries.id,
      amount: ledgerEntries.amount,
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
  const exactDates = [
    ...new Set(entries.flatMap((entry) => (entry.entryDate == null ? [] : [entry.entryDate]))),
  ];
  const [datedRates, latestRate] = await Promise.all([
    exactDates.length === 0
      ? Promise.resolve([])
      : tx.select().from(currencyRates).where(inArray(currencyRates.date, exactDates)),
    entries.some((entry) => entry.entryDate == null)
      ? tx
          .select()
          .from(currencyRates)
          .orderBy(desc(currencyRates.date))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);
  const ratesByDate = new Map(datedRates.map((rate) => [rate.date, rate]));
  const changes = entries.map((entry) => {
    const sourceCurrency = entry.currency ?? "CNY";
    let convertedAmount: string;
    let exchangeRate: string;
    if (sourceCurrency !== mainCurrency) {
      const rate = entry.entryDate == null ? latestRate : ratesByDate.get(entry.entryDate);
      if (rate == null) {
        throw new AppError(
          "No stored currency rates are available",
          "EXCHANGE_RATES_UNAVAILABLE",
          409
        );
      }
      const rateRatio = resolveRateRatio(
        { base: rate.base, date: rate.date, rates: rate.rates },
        sourceCurrency,
        mainCurrency
      );
      convertedAmount = roundToCurrency(multiply(entry.amount, rateRatio), mainCurrency);
      exchangeRate = rateRatio;
    } else {
      convertedAmount = roundToCurrency(entry.amount, mainCurrency);
      exchangeRate = "1";
    }
    return {
      id: entry.id,
      converted_amount: convertedAmount,
      exchange_rate: exchangeRate,
    };
  });
  const updated = await tx.execute(sql`
    WITH amounts AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS value(
        id uuid,
        converted_amount numeric,
        exchange_rate numeric
      )
    )
    UPDATE ledger_entries AS entry
    SET converted_amount = amounts.converted_amount,
        exchange_rate = amounts.exchange_rate,
        updated_at = ${new Date()}
    FROM amounts
    WHERE entry.id = amounts.id
      AND entry.ledger_id = ${ledgerId}
      AND entry.deleted_at IS NULL
    RETURNING entry.id
  `);
  if (updated.rows.length !== entries.length) {
    throw new ConflictError("Ledger entries changed during currency recalculation");
  }
  return entries.length;
}

export const postgresLedgerAdapter: LedgerPort = {
  async getLedgerIdForCredential(credentialId) {
    const row = await db
      .select({ ledgerId: serviceCredentials.ledgerId })
      .from(serviceCredentials)
      .innerJoin(
        ledgers,
        and(eq(ledgers.id, serviceCredentials.ledgerId), isNull(ledgers.deletedAt))
      )
      .where(and(eq(serviceCredentials.id, credentialId), isNull(serviceCredentials.deletedAt)))
      .limit(1);
    const match = row[0];
    if (match == null) return null;
    try {
      const updated = await db
        .update(serviceCredentials)
        .set({
          lastUsedAt: sql`CASE
            WHEN ${serviceCredentials.lastUsedAt} IS NULL
              OR ${serviceCredentials.lastUsedAt} < now() - interval '5 minutes'
            THEN now()
            ELSE ${serviceCredentials.lastUsedAt}
          END`,
        })
        .where(and(eq(serviceCredentials.id, credentialId), isNull(serviceCredentials.deletedAt)))
        .returning({ id: serviceCredentials.id });
      return updated.length === 1 ? match.ledgerId : null;
    } catch (error) {
      logError("modules/ledger:resolve-service-credential:update-last-used", error);
      return match.ledgerId;
    }
  },

  async isOwnedByUser(ledgerId, userId) {
    const row = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)))
      .limit(1);
    return row.length === 1;
  },

  async getOwned(ledgerId, userId) {
    const row = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    });
    return row == null
      ? null
      : {
          id: row.id,
          userId: row.userId,
          settings: mapLedgerSettings(row),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
  },
  async listIdsForUser(userId) {
    const rows = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)))
      .orderBy(desc(ledgers.createdAt));
    return rows.map((row) => row.id);
  },
  async listForUser(userId) {
    const rows = await db.query.ledgers.findMany({
      where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
      orderBy: [desc(ledgers.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      settings: mapLedgerSettings(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },
  async createDefault(input) {
    try {
      return db.transaction(async (tx) => {
        const row = await tx
          .insert(ledgers)
          .values({ userId: input.userId, ...settingsColumns(input.settings) })
          .returning()
          .then((rows) => rows[0]);
        if (row == null) throw new ConflictError("Failed to create ledger");
        if (input.categories.length > 0) {
          await tx
            .insert(entryCategories)
            .values(input.categories.map((category) => ({ ...category, ledgerId: row.id })));
        }
        return {
          id: row.id,
          userId: row.userId,
          settings: mapLedgerSettings(row),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        error.constraint === "uniq_ledgers_user_id"
      ) {
        throw new ConflictError("User already has an active ledger");
      }
      throw error;
    }
  },
  async deleteOwned(ledgerId, userId) {
    return db.transaction(async (tx) => {
      const row = await tx
        .select()
        .from(ledgers)
        .where(eq(ledgers.id, ledgerId))
        .for("update")
        .then((rows) => rows[0]);
      if (row == null) return "not_found" as const;
      if (row.userId !== userId) return "not_found" as const;
      if (row.deletedAt != null) return "already_deleted" as const;
      const now = new Date();
      await tx
        .update(sourceDocumentRevisions)
        .set({ outcome: "cancelled", finalizedAt: now })
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, ledgerId),
            eq(sourceDocumentRevisions.outcome, "processing")
          )
        );
      await tx
        .update(processingOutbox)
        .set({
          status: "cancelled",
          completedAt: now,
          claimToken: null,
          claimedAt: null,
          claimExpiresAt: null,
        })
        .where(
          and(
            eq(processingOutbox.ledgerId, ledgerId),
            inArray(processingOutbox.status, ["pending", "claimed"])
          )
        );
      await tx
        .update(processingAttempts)
        .set({ status: "cancelled", completedAt: now })
        .where(
          and(
            eq(processingAttempts.ledgerId, ledgerId),
            inArray(processingAttempts.status, ["queued", "processing"])
          )
        );
      await tx
        .update(duplicateReviews)
        .set({ status: "discarded", decision: "superseded", decidedAt: now, updatedAt: now })
        .where(
          and(
            eq(duplicateReviews.ledgerId, ledgerId),
            inArray(duplicateReviews.status, ["pending", "staged"])
          )
        );
      await tx
        .update(ledgerEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)));
      await tx
        .update(entryCategories)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)));
      await tx
        .update(sourceDocuments)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt)));
      await tx
        .update(serviceCredentials)
        .set({ deletedAt: now })
        .where(
          and(eq(serviceCredentials.ledgerId, ledgerId), isNull(serviceCredentials.deletedAt))
        );
      const files = await tx
        .select({ storageKey: storedFiles.storageKey })
        .from(storedFiles)
        .where(eq(storedFiles.ledgerId, ledgerId));
      if (files.length > 0) {
        await tx
          .insert(objectCleanupJobs)
          .values(files.map((file) => ({ storageKey: file.storageKey })))
          .onConflictDoNothing();
      }
      await tx.delete(revisionFiles).where(eq(revisionFiles.ledgerId, ledgerId));
      await tx.delete(uploadSessionFiles).where(eq(uploadSessionFiles.ledgerId, ledgerId));
      await tx.delete(storedFiles).where(eq(storedFiles.ledgerId, ledgerId));
      await tx
        .update(ledgers)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(ledgers.id, ledgerId));
      return "deleted" as const;
    });
  },
};

export const postgresCategoryAdapter: CategoryPort = {
  async list(ledgerId) {
    const rows = await db
      .select()
      .from(entryCategories)
      .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)))
      .orderBy(entryCategories.sortOrder, entryCategories.createdAt);
    return rows.map(mapCategory);
  },

  async get(ledgerId, categoryId) {
    const row = await db.query.entryCategories.findFirst({
      where: and(
        eq(entryCategories.ledgerId, ledgerId),
        eq(entryCategories.id, categoryId),
        isNull(entryCategories.deletedAt)
      ),
    });
    return row == null ? null : mapCategory(row);
  },

  async listWithCount(ledgerId) {
    const rows = await db
      .select({
        category: entryCategories,
        entryCount: sql<number>`count(${sourceDocuments.id})`,
      })
      .from(entryCategories)
      .leftJoin(
        ledgerEntries,
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.categoryId, entryCategories.id),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .leftJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
          eq(sourceDocuments.ledgerId, ledgerId),
          eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)))
      .groupBy(entryCategories.id)
      .orderBy(entryCategories.sortOrder, entryCategories.createdAt);
    return rows.map(({ category, entryCount }) => ({
      ...mapCategory(category),
      entryCount: Number(entryCount),
    }));
  },

  async create(ledgerId, input) {
    const [last] = await db
      .select({ sortOrder: entryCategories.sortOrder })
      .from(entryCategories)
      .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)))
      .orderBy(desc(entryCategories.sortOrder))
      .limit(1);
    const created = await db
      .insert(entryCategories)
      .values({ ...input, ledgerId, sortOrder: input.sortOrder ?? (last?.sortOrder ?? -1) + 1 })
      .returning()
      .then((rows) => rows[0]);
    if (created == null) throw new ConflictError("Failed to create category");
    return mapCategory(created);
  },

  async update(ledgerId, categoryId, input) {
    const updated = await db
      .update(entryCategories)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(entryCategories.ledgerId, ledgerId),
          eq(entryCategories.id, categoryId),
          isNull(entryCategories.deletedAt)
        )
      )
      .returning()
      .then((rows) => rows[0]);
    return updated == null ? null : mapCategory(updated);
  },

  async updateMissingMetadata(ledgerId, categoryId, input) {
    // Single atomic statement: the missing-value predicates are evaluated
    // against the row's own current columns, so a concurrent backfill that
    // commits first wins and the loser re-checks the predicates against the
    // updated row (READ COMMITTED EvalPlanQual) instead of overwriting it.
    // The wrote flags come from RETURNING, never from a stale pre-read.
    const now = new Date();
    const result = await db.execute<{
      wroteIcon: boolean;
      wroteDescription: boolean;
    }>(sql`
      UPDATE entry_categories category
      SET icon = CASE
            WHEN category.icon IS NULL OR category.icon = '' THEN ${input.icon}
            ELSE category.icon
          END,
          description = CASE
            WHEN category.description IS NULL OR category.description = ''
              THEN ${input.description}
            ELSE category.description
          END,
          updated_at = ${now}
      WHERE category.id = ${categoryId}
        AND category.ledger_id = ${ledgerId}
        AND category.deleted_at IS NULL
        AND (
          category.icon IS NULL OR category.icon = ''
          OR category.description IS NULL OR category.description = ''
        )
      RETURNING
        category.icon IS NOT DISTINCT FROM ${input.icon} AS "wroteIcon",
        category.description IS NOT DISTINCT FROM ${input.description} AS "wroteDescription"
    `);
    const row = result.rows[0];
    return {
      wroteIcon: row?.wroteIcon ?? false,
      wroteDescription: row?.wroteDescription ?? false,
    };
  },

  async delete(ledgerId, categoryId) {
    return db.transaction(async (tx) => {
      await lockLedgerForUpdate(tx, ledgerId);
      const category = await tx
        .select({ id: entryCategories.id })
        .from(entryCategories)
        .where(
          and(
            eq(entryCategories.ledgerId, ledgerId),
            eq(entryCategories.id, categoryId),
            isNull(entryCategories.deletedAt)
          )
        )
        .then((rows) => rows[0]);
      if (category == null) return false;
      const now = new Date();
      await tx
        .update(ledgerEntries)
        .set({ categoryId: null, updatedAt: now })
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            eq(ledgerEntries.categoryId, categoryId),
            isNull(ledgerEntries.deletedAt)
          )
        );
      await tx
        .update(entryCategories)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(entryCategories.ledgerId, ledgerId), eq(entryCategories.id, categoryId)));
      return true;
    });
  },

  async reorder(ledgerId, categoryIds) {
    return db.transaction(async (tx) => {
      if (categoryIds.length === 0) return 0;
      const owned = await tx
        .select({ id: entryCategories.id })
        .from(entryCategories)
        .where(
          and(
            eq(entryCategories.ledgerId, ledgerId),
            inArray(entryCategories.id, [...categoryIds]),
            isNull(entryCategories.deletedAt)
          )
        );
      if (owned.length !== new Set(categoryIds).size) {
        throw new ValidationError("Category reorder contains an inaccessible category");
      }
      const ordering = JSON.stringify(
        categoryIds.map((id, sortOrder) => ({ id, sort_order: sortOrder }))
      );
      const updated = await tx.execute(sql`
        WITH positions AS (
          SELECT * FROM jsonb_to_recordset(${ordering}::jsonb) AS value(
            id uuid,
            sort_order integer
          )
        )
        UPDATE entry_categories AS category
        SET sort_order = positions.sort_order,
            updated_at = ${new Date()}
        FROM positions
        WHERE category.id = positions.id
          AND category.ledger_id = ${ledgerId}
          AND category.deleted_at IS NULL
        RETURNING category.id
      `);
      if (updated.rows.length !== categoryIds.length) {
        throw new ConflictError("Category reorder changed during update");
      }
      return categoryIds.length;
    });
  },

  async saveAll(ledgerId, targets) {
    return db.transaction(async (tx) => {
      await lockLedgerForUpdate(tx, ledgerId);
      const current = await tx
        .select()
        .from(entryCategories)
        .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)))
        .orderBy(entryCategories.sortOrder, entryCategories.createdAt)
        .for("update");
      const currentById = new Map(current.map((category) => [category.id, category]));
      const targetIds = new Set(targets.map((target) => target.id ?? target.clientId!));

      for (const target of targets) {
        const resolvedId = target.id ?? target.clientId!;
        const existing = currentById.get(resolvedId);
        if (target.id != null && existing == null) {
          throw new ValidationError("Category target contains an inaccessible category");
        }
        if (
          existing != null &&
          !existing.isEditable &&
          (existing.name !== target.name ||
            existing.description !== target.description ||
            existing.icon !== target.icon ||
            existing.sortOrder !== target.sortOrder)
        ) {
          throw new ValidationError("A non-editable category cannot be changed");
        }
      }

      const removed = current.filter((category) => !targetIds.has(category.id));
      if (removed.some((category) => !category.isEditable)) {
        throw new ValidationError("A non-editable category cannot be deleted");
      }

      const now = new Date();
      const removedIds = removed.map((category) => category.id);
      if (removedIds.length > 0) {
        await tx
          .update(ledgerEntries)
          .set({ categoryId: null, updatedAt: now })
          .where(
            and(
              eq(ledgerEntries.ledgerId, ledgerId),
              inArray(ledgerEntries.categoryId, removedIds),
              isNull(ledgerEntries.deletedAt)
            )
          );
        await tx
          .update(entryCategories)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            and(
              eq(entryCategories.ledgerId, ledgerId),
              inArray(entryCategories.id, removedIds),
              isNull(entryCategories.deletedAt)
            )
          );
      }

      const renamedExisting = targets.filter((target) => {
        const existing = currentById.get(target.id ?? target.clientId!);
        return existing?.isEditable === true && existing.name !== target.name;
      });
      for (const target of renamedExisting) {
        const resolvedId = target.id ?? target.clientId!;
        await tx
          .update(entryCategories)
          .set({ name: `__cashier_category_${resolvedId}`, updatedAt: now })
          .where(
            and(
              eq(entryCategories.ledgerId, ledgerId),
              eq(entryCategories.id, resolvedId),
              isNull(entryCategories.deletedAt)
            )
          );
      }

      for (const target of targets) {
        const resolvedId = target.id ?? target.clientId!;
        const existing = currentById.get(resolvedId);
        if (existing == null) {
          await tx.insert(entryCategories).values({
            id: resolvedId,
            ledgerId,
            name: target.name,
            description: target.description,
            icon: target.icon,
            sortOrder: target.sortOrder,
            isEditable: true,
            updatedAt: now,
          });
        } else if (existing.isEditable) {
          await tx
            .update(entryCategories)
            .set({
              name: target.name,
              description: target.description,
              icon: target.icon,
              sortOrder: target.sortOrder,
              updatedAt: now,
            })
            .where(
              and(
                eq(entryCategories.ledgerId, ledgerId),
                eq(entryCategories.id, resolvedId),
                isNull(entryCategories.deletedAt)
              )
            );
        }
      }

      const savedIds = targets.map((target) => target.id ?? target.clientId!);
      if (savedIds.length === 0) return [];
      const saved = await tx
        .select()
        .from(entryCategories)
        .where(
          and(
            eq(entryCategories.ledgerId, ledgerId),
            inArray(entryCategories.id, savedIds),
            isNull(entryCategories.deletedAt)
          )
        );
      const savedById = new Map(saved.map((category) => [category.id, category]));
      if (savedById.size !== savedIds.length) {
        throw new ConflictError("Category save changed during update");
      }
      return savedIds.map((id) => mapCategory(savedById.get(id)!));
    });
  },

  async countUncategorized(ledgerId) {
    const row = await db
      .select({ count: sql<number>`count(*)` })
      .from(ledgerEntries)
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
          eq(sourceDocuments.ledgerId, ledgerId),
          eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          isNull(ledgerEntries.categoryId),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .then((rows) => rows[0]);
    return Number(row?.count ?? 0);
  },
};

export const postgresSettingsAdapter: SettingsPort = {
  async get(ledgerId) {
    const ledger = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
      columns: {
        aiLanguage: true,
        preferredCurrencies: true,
        mainCurrency: true,
        collapseEntriesDefault: true,
        aiCustomPrompt: true,
        duplicateDetectionEnabled: true,
        timeZone: true,
      },
    });
    return ledger == null ? null : mapLedgerSettings(ledger as typeof ledgers.$inferSelect);
  },

  async update(input) {
    return db.transaction(async (tx) => {
      // Lock the ledger row to serialise with concurrent first-entry creation.
      // This prevents a main-currency change from interleaving with activateRevision / createManual.
      const ledger = await tx
        .select()
        .from(ledgers)
        .where(
          and(
            eq(ledgers.id, input.ledgerId),
            eq(ledgers.userId, input.userId),
            isNull(ledgers.deletedAt)
          )
        )
        .for("update")
        .then((rows) => rows[0]);
      if (ledger == null) return null;
      const settings = { ...mapLedgerSettings(ledger), ...input.settings };
      const previousMainCurrency = ledger.mainCurrency;
      const nextMainCurrency = settings.mainCurrency ?? "CNY";
      if (previousMainCurrency !== nextMainCurrency) {
        await recalculateCurrentEntries(tx, input.ledgerId, nextMainCurrency);
      }
      const updated = await tx
        .update(ledgers)
        .set({ ...settingsColumns(settings), updatedAt: new Date() })
        .where(and(eq(ledgers.id, input.ledgerId), eq(ledgers.userId, input.userId)))
        .returning()
        .then((rows) => rows[0]);
      if (updated == null) throw new ConflictError("Failed to update ledger settings");
      return {
        id: updated.id,
        userId: updated.userId,
        settings: mapLedgerSettings(updated),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  },
};

export const postgresCurrencyAdapter: CurrencyPort = {
  async convert(amount, from, to, date) {
    if (!isValidDecimal(amount)) throw new ValidationError("Amount must be numeric");
    if (from === to) return roundToCurrency(amount, to);
    const [rateRow] = await db
      .select()
      .from(currencyRates)
      .where(date == null ? undefined : eq(currencyRates.date, date.split("T")[0] ?? date))
      .orderBy(desc(currencyRates.date))
      .limit(1);
    if (rateRow == null) throw new ConflictError("No stored currency rates are available");
    return convertWithRates(
      amount,
      { base: rateRow.base, date: rateRow.date, rates: rateRow.rates },
      from,
      to
    ).convertedAmount;
  },
  async recalculateLedger(ledgerId, mainCurrency) {
    return db.transaction(async (tx) => {
      // Lock the ledger to serialise with concurrent settings changes.
      await lockLedgerForUpdate(tx, ledgerId);
      return recalculateCurrentEntries(tx, ledgerId, mainCurrency);
    });
  },
  async recalculateLedgerForDate(ledgerId, date) {
    const targetDate = date.split("T")[0] ?? date;
    return db.transaction(async (tx) => {
      const ledger = await lockLedgerForUpdate(tx, ledgerId);
      // Entries dated on the event use that date's rates; undated entries use
      // the latest stored rate, so both must be refreshed.
      return recalculateCurrentEntries(tx, ledgerId, ledger.mainCurrency, targetDate, true);
    });
  },
};

export function createPostgresAuthenticationAdapter(
  resolveAuthenticatedUserId: () => Promise<string | null>
): AuthenticationPort {
  return {
    async requireUser() {
      const userId = await resolveAuthenticatedUserId();
      if (userId == null || userId === "") throw new UnauthorizedError();
      const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), isNull(users.deletedAt)),
        columns: { id: true },
      });
      if (user == null) throw new UnauthorizedError();
      return user;
    },
  };
}

export const postgresServiceCredentialAdapter: ServiceCredentialPort = {
  async authenticate(key) {
    // Hash-based lookup: compute hash and match in DB
    const computedHash = computeHash(key);

    const hashMatch = await db
      .select({
        id: serviceCredentials.id,
        ledgerId: serviceCredentials.ledgerId,
        lastUsedAt: serviceCredentials.lastUsedAt,
      })
      .from(serviceCredentials)
      .innerJoin(
        ledgers,
        and(eq(ledgers.id, serviceCredentials.ledgerId), isNull(ledgers.deletedAt))
      )
      .where(
        and(eq(serviceCredentials.tokenHash, computedHash), isNull(serviceCredentials.deletedAt))
      )
      .then((rows) => rows[0]);

    if (hashMatch) {
      // Throttle the lastUsedAt write: credentials used within the last five
      // minutes skip the UPDATE entirely, so status polling cannot amplify
      // write load for hot credentials.
      const lastUsedAt = hashMatch.lastUsedAt;
      const stale =
        lastUsedAt == null ||
        Date.now() - lastUsedAt.getTime() > SERVICE_CREDENTIAL_LAST_USED_STALE_MS;
      if (stale) {
        try {
          const [updated] = await db
            .update(serviceCredentials)
            .set({ lastUsedAt: new Date() })
            .where(
              and(eq(serviceCredentials.id, hashMatch.id), isNull(serviceCredentials.deletedAt))
            )
            .returning({ id: serviceCredentials.id });
          // Revoke-race guard: if credential was revoked between SELECT and UPDATE,
          // the UPDATE returns 0 rows — return null to prevent auth through revoked credential.
          if (!updated) return null;
        } catch (error) {
          logError("modules/ledger:authenticate-service-credential:update-last-used", error);
        }
      } else {
        // Fresh path: skip the lastUsedAt write, but keep the revocation fence
        // with a locking re-read. FOR SHARE waits for any in-flight revoke and
        // re-evaluates the deletedAt predicate against the committed row, so a
        // credential revoked after the hash lookup still fails this request —
        // the same guarantee the stale path gets from its conditional UPDATE.
        const active = await db
          .select({ id: serviceCredentials.id })
          .from(serviceCredentials)
          .where(and(eq(serviceCredentials.id, hashMatch.id), isNull(serviceCredentials.deletedAt)))
          .for("share")
          .limit(1)
          .then((rows) => rows[0]);
        if (active == null) return null;
      }
      // The authenticated contract is deliberately bounded to id + ledgerId;
      // lastUsedAt is read internally only to throttle the write.
      return { id: hashMatch.id, ledgerId: hashMatch.ledgerId };
    }

    return null;
  },

  async list(ledgerId) {
    const rows = await db
      .select()
      .from(serviceCredentials)
      .where(and(eq(serviceCredentials.ledgerId, ledgerId), isNull(serviceCredentials.deletedAt)))
      .orderBy(desc(serviceCredentials.createdAt));
    return rows.map((row) => ({
      id: row.id,
      tokenPrefix: row.tokenPrefix ?? "",
      tokenSuffix: row.tokenSuffix ?? "",
      ledgerId: row.ledgerId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: toIso(row.lastUsedAt),
    }));
  },

  async create(ledgerId, name) {
    const { token, hash, prefix, suffix } = createToken();
    const row = await db
      .insert(serviceCredentials)
      .values({ ledgerId, name, tokenHash: hash, tokenPrefix: prefix, tokenSuffix: suffix })
      .returning()
      .then((rows) => rows[0]);
    if (row == null) throw new ConflictError("Failed to create service credential");
    return {
      id: row.id,
      token: token,
      tokenPrefix: row.tokenPrefix ?? "",
      tokenSuffix: row.tokenSuffix ?? "",
      ledgerId: row.ledgerId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: toIso(row.lastUsedAt),
    };
  },

  async revoke(ledgerId, credentialId) {
    const result = await db
      .update(serviceCredentials)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(serviceCredentials.ledgerId, ledgerId),
          eq(serviceCredentials.id, credentialId),
          isNull(serviceCredentials.deletedAt)
        )
      )
      .returning({ id: serviceCredentials.id });
    return result.length === 1;
  },
};

export const postgresOtpTokenAdapter: OtpTokenPort = {
  async replace(input) {
    await db
      .insert(otpTokens)
      .values({
        email: input.email,
        tokenHash: input.tokenHash,
        expires: input.expiresAt,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      })
      .onConflictDoUpdate({
        target: otpTokens.email,
        set: {
          tokenHash: input.tokenHash,
          expires: input.expiresAt,
          attempts: 0,
          lockedUntil: null,
          lastAttemptAt: null,
          verifiedAt: null,
          ipAddress: input.ipAddress ?? null,
          createdAt: new Date(),
        },
      });
  },
  async find(email) {
    const row = await db
      .select()
      .from(otpTokens)
      .where(eq(otpTokens.email, email))
      .limit(1)
      .then((rows) => rows[0]);
    return row == null
      ? null
      : {
          email: row.email,
          tokenHash: row.tokenHash,
          expiresAt: row.expires,
          attempts: row.attempts,
          lockedUntil: row.lockedUntil,
          verifiedAt: row.verifiedAt,
        };
  },
  async recordFailure(input) {
    const rows = await db
      .update(otpTokens)
      .set({
        attempts: sql`${otpTokens.attempts} + 1`,
        lastAttemptAt: new Date(),
        lockedUntil: sql`case
          when ${otpTokens.attempts} + 1 >= ${input.maxAttempts} then ${input.lockedUntil}
          else ${otpTokens.lockedUntil}
        end`,
      })
      .where(
        and(
          eq(otpTokens.email, input.email),
          eq(otpTokens.tokenHash, input.tokenHash),
          isNull(otpTokens.verifiedAt),
          sql`${otpTokens.attempts} < ${input.maxAttempts}`
        )
      )
      .returning({ attempts: otpTokens.attempts, lockedUntil: otpTokens.lockedUntil });
    return rows[0] ?? null;
  },
  async claim(input) {
    const rows = await db
      .update(otpTokens)
      .set({ verifiedAt: input.now })
      .where(
        and(
          eq(otpTokens.email, input.email),
          eq(otpTokens.tokenHash, input.tokenHash),
          isNull(otpTokens.verifiedAt),
          sql`${otpTokens.expires} > ${input.now}`,
          sql`${otpTokens.attempts} < ${input.maxAttempts}`,
          or(isNull(otpTokens.lockedUntil), sql`${otpTokens.lockedUntil} <= ${input.now}`)
        )
      )
      .returning({ id: otpTokens.id });
    return rows.length === 1;
  },
  async release(input) {
    const rows = await db
      .update(otpTokens)
      .set({ verifiedAt: null })
      .where(
        and(
          eq(otpTokens.email, input.email),
          eq(otpTokens.tokenHash, input.tokenHash),
          sql`${otpTokens.verifiedAt} is not null`
        )
      )
      .returning({ id: otpTokens.id });
    return rows.length === 1;
  },
  async consume(input) {
    const rows = await db
      .delete(otpTokens)
      .where(
        and(
          eq(otpTokens.email, input.email),
          eq(otpTokens.tokenHash, input.tokenHash),
          sql`${otpTokens.verifiedAt} is not null`
        )
      )
      .returning({ id: otpTokens.id });
    return rows.length === 1;
  },
  async discard(input) {
    const rows = await db
      .delete(otpTokens)
      .where(and(eq(otpTokens.email, input.email), eq(otpTokens.tokenHash, input.tokenHash)))
      .returning({ id: otpTokens.id });
    return rows.length === 1;
  },
  async delete(email) {
    await db.delete(otpTokens).where(eq(otpTokens.email, email));
  },
  async cleanupExpired(now) {
    const deleted = await db
      .delete(otpTokens)
      .where(lt(otpTokens.expires, now))
      .returning({ id: otpTokens.id });
    return deleted.length;
  },
};

export const postgresUserAccountAdapter: UserAccountPort = {
  async findOrCreate(email, name) {
    return db.transaction(async (tx) => {
      const created = await tx
        .insert(users)
        .values({ email, ...(name === undefined ? {} : { name }), emailVerified: new Date() })
        .onConflictDoNothing()
        .returning()
        .then((rows) => rows[0]);
      const row =
        created ??
        (await tx
          .select()
          .from(users)
          .where(and(eq(users.email, email), isNull(users.deletedAt)))
          .then((rows) => rows[0]));
      if (row == null) throw new ConflictError("Failed to create user account");
      return {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          image: row.image,
          passwordHash: row.passwordHash,
          passwordUpdatedAt: row.passwordUpdatedAt,
          authVersion: row.authVersion,
          registrationCompletedAt: row.registrationCompletedAt,
          interfaceLanguage: normalizeUserPreferences(row.preferences).interfaceLanguage,
        },
        isExistingUser: created == null,
      };
    });
  },
  async findByEmail(email) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.email, email), isNull(users.deletedAt)),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
        passwordHash: true,
        passwordUpdatedAt: true,
        authVersion: true,
        registrationCompletedAt: true,
        preferences: true,
      },
    });
    return row == null
      ? null
      : {
          id: row.id,
          email: row.email,
          name: row.name,
          image: row.image,
          passwordHash: row.passwordHash,
          passwordUpdatedAt: row.passwordUpdatedAt,
          authVersion: row.authVersion,
          registrationCompletedAt: row.registrationCompletedAt,
          interfaceLanguage: normalizeUserPreferences(row.preferences).interfaceLanguage,
        };
  },
  async findById(id) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, id), isNull(users.deletedAt)),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
        passwordHash: true,
        passwordUpdatedAt: true,
        authVersion: true,
        registrationCompletedAt: true,
        preferences: true,
      },
    });
    return row == null
      ? null
      : {
          id: row.id,
          email: row.email,
          name: row.name,
          image: row.image,
          passwordHash: row.passwordHash,
          passwordUpdatedAt: row.passwordUpdatedAt,
          authVersion: row.authVersion,
          registrationCompletedAt: row.registrationCompletedAt,
          interfaceLanguage: normalizeUserPreferences(row.preferences).interfaceLanguage,
        };
  },
  async completeRegistration(userId, completedAt) {
    const updated = await db
      .update(users)
      .set({ registrationCompletedAt: completedAt, updatedAt: completedAt })
      .where(
        and(eq(users.id, userId), isNull(users.deletedAt), isNull(users.registrationCompletedAt))
      )
      .returning({ id: users.id });
    return updated.length === 1;
  },
};

export const postgresUserPreferencesAdapter: UserPreferencesPort = {
  async get(userId) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { preferences: true },
    });
    return row == null ? null : normalizeUserPreferences(row.preferences);
  },

  async update(input) {
    const updated = await db
      .update(users)
      .set({ preferences: input.preferences, updatedAt: new Date() })
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
      .returning({ preferences: users.preferences })
      .then((rows) => rows[0]);
    return updated == null ? null : normalizeUserPreferences(updated.preferences);
  },
};
