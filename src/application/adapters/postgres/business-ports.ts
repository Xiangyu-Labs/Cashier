import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type {
  AuthenticationPort,
  CategoryPort,
  CurrencyPort,
  IdempotencyPort,
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
import { multiply, divide, round as decimalRound, isValidDecimal } from "@/lib/money/decimal";
import {
  currencyRates,
  entryCategories,
  idempotencyRecords,
  ledgerEntries,
  ledgers,
  otpTokens,
  serviceCredentials,
  sourceDocuments,
  users,
} from "@/persistence";
import { createToken, computeHash } from "@/lib/security/service-credential-token";
import { lockLedgerForUpdate } from "./transaction-locks";

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
      const fromRate = sourceCurrency === rate.base ? 1 : rate.rates[sourceCurrency];
      const toRate = mainCurrency === rate.base ? 1 : rate.rates[mainCurrency];
      if (fromRate == null || toRate == null || fromRate <= 0 || toRate <= 0) {
        throw new AppError("Unsupported currency conversion", "CURRENCY_NOT_FOUND", 400);
      }
      const rateRatio = multiply(String(toRate), divide(String(1), String(fromRate)));
      convertedAmount = decimalRound(multiply(entry.amount, rateRatio), 2);
      exchangeRate = decimalRound(rateRatio, 6);
    } else {
      convertedAmount = decimalRound(entry.amount, 2);
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
        .set({ lastUsedAt: new Date() })
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
        for (const category of input.categories) {
          await tx.insert(entryCategories).values({ ...category, ledgerId: row.id });
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
      if (error instanceof Error && "code" in error && error.code === "23505") {
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
        .then((rows) => rows[0]);
      if (row == null) return "not_found" as const;
      if (row.userId !== userId) return "forbidden" as const;
      if (row.deletedAt != null) return "already_deleted" as const;
      const now = new Date();
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
    return db.transaction(async (tx) => {
      const now = new Date();
      const [iconRows, descriptionRows] = await Promise.all([
        tx
          .update(entryCategories)
          .set({ icon: input.icon, updatedAt: now })
          .where(
            and(
              eq(entryCategories.id, categoryId),
              eq(entryCategories.ledgerId, ledgerId),
              isNull(entryCategories.deletedAt),
              or(isNull(entryCategories.icon), eq(entryCategories.icon, ""))
            )
          )
          .returning({ id: entryCategories.id }),
        tx
          .update(entryCategories)
          .set({ description: input.description, updatedAt: now })
          .where(
            and(
              eq(entryCategories.id, categoryId),
              eq(entryCategories.ledgerId, ledgerId),
              isNull(entryCategories.deletedAt),
              or(isNull(entryCategories.description), eq(entryCategories.description, ""))
            )
          )
          .returning({ id: entryCategories.id }),
      ]);
      return {
        wroteIcon: iconRows.length > 0,
        wroteDescription: descriptionRows.length > 0,
      };
    });
  },

  async delete(ledgerId, categoryId) {
    return db.transaction(async (tx) => {
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
    if (from === to) return amount;
    const [rateRow] = await db
      .select()
      .from(currencyRates)
      .where(date == null ? undefined : eq(currencyRates.date, date.split("T")[0] ?? date))
      .orderBy(desc(currencyRates.date))
      .limit(1);
    if (rateRow == null) throw new ConflictError("No stored currency rates are available");
    const fromRate = from === rateRow.base ? 1 : rateRow.rates[from];
    const toRate = to === rateRow.base ? 1 : rateRow.rates[to];
    if (fromRate == null || toRate == null || fromRate <= 0 || toRate <= 0) {
      throw new ValidationError("Unsupported currency conversion");
    }
    const rateRatio = divide(String(toRate), String(fromRate));
    return decimalRound(multiply(amount, rateRatio), 6);
  },
  async recalculateLedger(ledgerId, mainCurrency) {
    return db.transaction(async (tx) => {
      // Lock the ledger to serialise with concurrent settings changes.
      await lockLedgerForUpdate(tx, ledgerId);
      return recalculateCurrentEntries(tx, ledgerId, mainCurrency);
    });
  },
  async recalculateLedgerForDate(ledgerId, mainCurrency, date) {
    const targetDate = date.split("T")[0] ?? date;
    return db.transaction(async (tx) => {
      await lockLedgerForUpdate(tx, ledgerId);
      // Entries dated on the event use that date's rates; undated entries use
      // the latest stored rate, so both must be refreshed.
      return recalculateCurrentEntries(tx, ledgerId, mainCurrency, targetDate, true);
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
      .select({ id: serviceCredentials.id, ledgerId: serviceCredentials.ledgerId })
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
      try {
        const [updated] = await db
          .update(serviceCredentials)
          .set({ lastUsedAt: new Date() })
          .where(and(eq(serviceCredentials.id, hashMatch.id), isNull(serviceCredentials.deletedAt)))
          .returning({ id: serviceCredentials.id });
        // Revoke-race guard: if credential was revoked between SELECT and UPDATE,
        // the UPDATE returns 0 rows — return null to prevent auth through revoked credential.
        if (!updated) return null;
      } catch (error) {
        logError("modules/ledger:authenticate-service-credential:update-last-used", error);
      }
      return hashMatch;
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

const IDEMPOTENCY_WAIT_ATTEMPTS = 10;
const IDEMPOTENCY_LEASE_MS = 30_000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const postgresIdempotencyAdapter: IdempotencyPort = {
  async execute<T>(
    credentialId: string,
    key: string,
    operation: () => Promise<T>,
    contentFingerprint?: string
  ): Promise<T> {
    if (key.trim() === "" || key.length > 512) {
      throw new ValidationError("Idempotency key must contain between 1 and 512 characters");
    }

    const now = new Date();
    const leaseToken = crypto.randomUUID();
    const claimed = await db
      .insert(idempotencyRecords)
      .values({
        credentialId,
        key,
        status: "pending",
        contentFingerprint: contentFingerprint ?? null,
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + IDEMPOTENCY_LEASE_MS),
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      })
      .onConflictDoUpdate({
        target: [idempotencyRecords.credentialId, idempotencyRecords.key],
        set: {
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + IDEMPOTENCY_LEASE_MS),
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
        setWhere: sql`${idempotencyRecords.status} = 'pending'
          AND ${idempotencyRecords.leaseExpiresAt} < ${now}
          AND ${idempotencyRecords.contentFingerprint} IS NOT DISTINCT FROM ${contentFingerprint ?? null}`,
      })
      .returning({ key: idempotencyRecords.key });
    if (claimed.length === 1) {
      try {
        const result = await operation();
        const committed = await db
          .update(idempotencyRecords)
          .set({
            status: "completed",
            result: { value: result },
            completedAt: new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
          })
          .where(
            and(
              eq(idempotencyRecords.credentialId, credentialId),
              eq(idempotencyRecords.key, key),
              eq(idempotencyRecords.leaseToken, leaseToken)
            )
          )
          .returning({ key: idempotencyRecords.key });
        if (committed.length !== 1) {
          throw new ConflictError("The idempotency lease expired before the result was committed");
        }
        return result;
      } catch (error) {
        await db
          .delete(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.credentialId, credentialId),
              eq(idempotencyRecords.key, key),
              eq(idempotencyRecords.leaseToken, leaseToken)
            )
          );
        throw error;
      }
    }

    for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_ATTEMPTS; attempt += 1) {
      const record = await db.query.idempotencyRecords.findFirst({
        where: and(
          eq(idempotencyRecords.credentialId, credentialId),
          eq(idempotencyRecords.key, key)
        ),
      });
      if (record != null && record.contentFingerprint !== (contentFingerprint ?? null)) {
        throw new ConflictError("Idempotency key was already used with different content");
      }
      if (record?.status === "completed") {
        return (record.result as { value: T }).value;
      }
      if (record == null) {
        return this.execute(credentialId, key, operation, contentFingerprint);
      }
      await wait(Math.min(25 * 2 ** attempt, 500));
    }
    throw new ConflictError("The idempotent request is still in progress");
  },
};

export const postgresOtpTokenAdapter: OtpTokenPort = {
  async replace(input) {
    await db.transaction(async (tx) => {
      await tx.delete(otpTokens).where(eq(otpTokens.email, input.email));
      await tx.insert(otpTokens).values({
        email: input.email,
        tokenHash: input.tokenHash,
        expires: input.expiresAt,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      });
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
      .where(eq(otpTokens.email, input.email))
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
          isNull(otpTokens.verifiedAt)
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
      const existing = await tx
        .select()
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .then((rows) => rows[0]);
      if (existing != null) {
        return {
          user: {
            id: existing.id,
            email: existing.email,
            name: existing.name,
            image: existing.image,
            passwordHash: existing.passwordHash,
            passwordUpdatedAt: existing.passwordUpdatedAt,
            interfaceLanguage: existing.preferences.interfaceLanguage,
          },
          isExistingUser: true,
        };
      }
      const created = await tx
        .insert(users)
        .values({ email, ...(name === undefined ? {} : { name }), emailVerified: new Date() })
        .returning()
        .then((rows) => rows[0]);
      if (created == null) throw new ConflictError("Failed to create user account");
      return {
        user: {
          id: created.id,
          email: created.email,
          name: created.name,
          image: created.image,
          passwordHash: created.passwordHash,
          passwordUpdatedAt: created.passwordUpdatedAt,
          interfaceLanguage: created.preferences.interfaceLanguage,
        },
        isExistingUser: false,
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
          interfaceLanguage: row.preferences?.interfaceLanguage ?? "auto",
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
          interfaceLanguage: row.preferences?.interfaceLanguage ?? "auto",
        };
  },
};

export const postgresUserPreferencesAdapter: UserPreferencesPort = {
  async get(userId) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { preferences: true },
    });
    return row?.preferences ?? null;
  },

  async update(input) {
    const updated = await db
      .update(users)
      .set({ preferences: input.preferences, updatedAt: new Date() })
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
      .returning({ preferences: users.preferences })
      .then((rows) => rows[0]);
    return updated?.preferences ?? null;
  },
};
