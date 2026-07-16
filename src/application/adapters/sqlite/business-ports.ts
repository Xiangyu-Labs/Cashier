import crypto from "crypto";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
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
} from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/error-handlers";
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

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
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

type SqliteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function recalculateActiveEntries(
  tx: SqliteTransaction,
  ledgerId: string,
  mainCurrency: string
): number {
  const entries = tx
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
        eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)))
    .all();
  for (const entry of entries) {
    const sourceCurrency = entry.currency ?? "CNY";
    let convertedAmount = Number(entry.amount);
    let exchangeRate = 1;
    if (sourceCurrency !== mainCurrency) {
      const rate = tx
        .select()
        .from(currencyRates)
        .where(
          entry.entryDate == null
            ? undefined
            : eq(currencyRates.date, entry.entryDate.split("T")[0] ?? entry.entryDate)
        )
        .orderBy(desc(currencyRates.date))
        .get();
      if (rate == null) throw new ConflictError("No stored currency rates are available");
      const fromRate = sourceCurrency === rate.base ? 1 : rate.rates[sourceCurrency];
      const toRate = mainCurrency === rate.base ? 1 : rate.rates[mainCurrency];
      if (fromRate == null || toRate == null || fromRate <= 0 || toRate <= 0) {
        throw new ValidationError("Unsupported currency conversion");
      }
      exchangeRate = toRate / fromRate;
      convertedAmount *= exchangeRate;
    }
    tx.update(ledgerEntries)
      .set({
        convertedAmount: convertedAmount.toFixed(2),
        exchangeRate: exchangeRate.toFixed(6),
        updatedAt: new Date(),
      })
      .where(and(eq(ledgerEntries.ledgerId, ledgerId), eq(ledgerEntries.id, entry.id)))
      .run();
  }
  return entries.length;
}

export const sqliteLedgerAdapter: LedgerPort = {
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
        .where(and(eq(serviceCredentials.id, credentialId), isNull(serviceCredentials.deletedAt)));
      return updated.changes === 1 ? match.ledgerId : null;
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
          settings: row.metadata?.settings ?? {},
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
      settings: row.metadata?.settings ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },
  async createDefault(input) {
    try {
      return db.transaction((tx) => {
        const row = tx
          .insert(ledgers)
          .values({ userId: input.userId, metadata: { settings: input.settings } })
          .returning()
          .get();
        for (const category of input.categories) {
          tx.insert(entryCategories).values({ ...category, ledgerId: row.id }).run();
        }
        return {
          id: row.id,
          userId: row.userId,
          settings: row.metadata?.settings ?? {},
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new ConflictError("User already has an active ledger");
      }
      throw error;
    }
  },
  async deleteOwned(ledgerId, userId) {
    return db.transaction((tx) => {
      const row = tx.select().from(ledgers).where(eq(ledgers.id, ledgerId)).get();
      if (row == null) return "not_found" as const;
      if (row.userId !== userId) return "forbidden" as const;
      if (row.deletedAt != null) return "already_deleted" as const;
      const now = new Date();
      tx.update(ledgerEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)))
        .run();
      tx.update(entryCategories)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)))
        .run();
      tx.update(sourceDocuments)
        .set({ status: "deleted", deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(sourceDocuments.ledgerId, ledgerId),
            isNull(sourceDocuments.deletedAt)
          )
        )
        .run();
      tx.update(ledgers).set({ deletedAt: now, updatedAt: now }).where(eq(ledgers.id, ledgerId)).run();
      return "deleted" as const;
    });
  },
};

export const sqliteCategoryAdapter: CategoryPort = {
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
    return rows.map(({ category, entryCount }) => ({ ...mapCategory(category), entryCount }));
  },

  async create(ledgerId, input) {
    const [last] = await db
      .select({ sortOrder: entryCategories.sortOrder })
      .from(entryCategories)
      .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)))
      .orderBy(desc(entryCategories.sortOrder))
      .limit(1);
    const created = db
      .insert(entryCategories)
      .values({ ...input, ledgerId, sortOrder: input.sortOrder ?? (last?.sortOrder ?? -1) + 1 })
      .returning()
      .get();
    return mapCategory(created);
  },

  async update(ledgerId, categoryId, input) {
    const updated = db
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
      .get();
    return updated == null ? null : mapCategory(updated);
  },

  async delete(ledgerId, categoryId) {
    return db.transaction((tx) => {
      const category = tx
        .select({ id: entryCategories.id })
        .from(entryCategories)
        .where(
          and(
            eq(entryCategories.ledgerId, ledgerId),
            eq(entryCategories.id, categoryId),
            isNull(entryCategories.deletedAt)
          )
        )
        .get();
      if (category == null) return false;
      const now = new Date();
      tx.update(ledgerEntries)
        .set({ categoryId: null, updatedAt: now })
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            eq(ledgerEntries.categoryId, categoryId),
            isNull(ledgerEntries.deletedAt)
          )
        )
        .run();
      tx.update(entryCategories)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(entryCategories.ledgerId, ledgerId), eq(entryCategories.id, categoryId)))
        .run();
      return true;
    });
  },

  async reorder(ledgerId, categoryIds) {
    return db.transaction((tx) => {
      if (categoryIds.length === 0) return 0;
      const owned = tx
        .select({ id: entryCategories.id })
        .from(entryCategories)
        .where(
          and(
            eq(entryCategories.ledgerId, ledgerId),
            inArray(entryCategories.id, [...categoryIds]),
            isNull(entryCategories.deletedAt)
          )
        )
        .all();
      if (owned.length !== new Set(categoryIds).size) {
        throw new ValidationError("Category reorder contains an inaccessible category");
      }
      for (const [sortOrder, id] of categoryIds.entries()) {
        tx.update(entryCategories)
          .set({ sortOrder, updatedAt: new Date() })
          .where(and(eq(entryCategories.ledgerId, ledgerId), eq(entryCategories.id, id)))
          .run();
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
      .get();
    return row?.count ?? 0;
  },
};

export const sqliteSettingsAdapter: SettingsPort = {
  async get(ledgerId) {
    const ledger = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
      columns: { metadata: true },
    });
    return ledger?.metadata?.settings ?? null;
  },

  async update(input) {
    return db.transaction((tx) => {
      const ledger = tx
        .select()
        .from(ledgers)
        .where(
          and(
            eq(ledgers.id, input.ledgerId),
            eq(ledgers.userId, input.userId),
            isNull(ledgers.deletedAt)
          )
        )
        .get();
      if (ledger == null) return null;
      const settings = { ...(ledger.metadata?.settings ?? {}), ...input.settings };
      const previousMainCurrency = ledger.metadata?.settings?.mainCurrency ?? "CNY";
      const nextMainCurrency = settings.mainCurrency ?? "CNY";
      if (previousMainCurrency !== nextMainCurrency) {
        recalculateActiveEntries(tx, input.ledgerId, nextMainCurrency);
      }
      const updated = tx
        .update(ledgers)
        .set({ metadata: { ...(ledger.metadata ?? {}), settings }, updatedAt: new Date() })
        .where(and(eq(ledgers.id, input.ledgerId), eq(ledgers.userId, input.userId)))
        .returning()
        .get();
      return {
        id: updated.id,
        userId: updated.userId,
        settings: updated.metadata?.settings ?? {},
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  },
};

export const sqliteCurrencyAdapter: CurrencyPort = {
  async convert(amount, from, to, date) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) throw new ValidationError("Amount must be numeric");
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
    return ((numericAmount / fromRate) * toRate).toFixed(6);
  },
  async recalculateLedger(ledgerId, mainCurrency) {
    return db.transaction((tx) => recalculateActiveEntries(tx, ledgerId, mainCurrency));
  },
};

export function createSqliteAuthenticationAdapter(
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

export const sqliteServiceCredentialAdapter: ServiceCredentialPort = {
  async authenticate(key) {
    const match = await db
        .select({ id: serviceCredentials.id, ledgerId: serviceCredentials.ledgerId })
        .from(serviceCredentials)
        .innerJoin(
          ledgers,
          and(eq(ledgers.id, serviceCredentials.ledgerId), isNull(ledgers.deletedAt))
        )
        .where(and(eq(serviceCredentials.key, key), isNull(serviceCredentials.deletedAt)))
        .get();
    if (match == null) return null;
    try {
      const updated = await db
        .update(serviceCredentials)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(serviceCredentials.id, match.id), isNull(serviceCredentials.deletedAt)))
        .run();
      return updated.changes === 1 ? match : null;
    } catch (error) {
      logError("modules/ledger:authenticate-service-credential:update-last-used", error);
      return match;
    }
  },

  async list(ledgerId) {
    const rows = await db
      .select()
      .from(serviceCredentials)
      .where(and(eq(serviceCredentials.ledgerId, ledgerId), isNull(serviceCredentials.deletedAt)))
      .orderBy(desc(serviceCredentials.createdAt));
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      ledgerId: row.ledgerId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: toIso(row.lastUsedAt),
    }));
  },

  async create(ledgerId, name) {
    const row = db
      .insert(serviceCredentials)
      .values({ ledgerId, name, key: `sk_live_${crypto.randomBytes(24).toString("hex")}` })
      .returning()
      .get();
    return {
      id: row.id,
      key: row.key,
      ledgerId: row.ledgerId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: toIso(row.lastUsedAt),
    };
  },

  async revoke(ledgerId, credentialId) {
    const result = db
      .update(serviceCredentials)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(serviceCredentials.ledgerId, ledgerId),
          eq(serviceCredentials.id, credentialId),
          isNull(serviceCredentials.deletedAt)
        )
      )
      .run();
    return result.changes === 1;
  },
};

const IDEMPOTENCY_WAIT_ATTEMPTS = 500;
const IDEMPOTENCY_WAIT_MS = 10;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const sqliteIdempotencyAdapter: IdempotencyPort = {
  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (key.trim() === "" || key.length > 512) {
      throw new ValidationError("Idempotency key must contain between 1 and 512 characters");
    }

    const claimed = db
      .insert(idempotencyRecords)
      .values({ key, status: "pending" })
      .onConflictDoNothing()
      .run().changes;
    if (claimed === 1) {
      try {
        const result = await operation();
        await db
          .update(idempotencyRecords)
          .set({ status: "completed", result: { value: result }, completedAt: new Date() })
          .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.status, "pending")));
        return result;
      } catch (error) {
        await db
          .delete(idempotencyRecords)
          .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.status, "pending")));
        throw error;
      }
    }

    for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_ATTEMPTS; attempt += 1) {
      const record = await db.query.idempotencyRecords.findFirst({
        where: eq(idempotencyRecords.key, key),
      });
      if (record?.status === "completed") {
        return (record.result as { value: T }).value;
      }
      if (record == null) {
        return this.execute(key, operation);
      }
      await wait(IDEMPOTENCY_WAIT_MS);
    }
    throw new ConflictError("The idempotent request is still in progress");
  },
};

export const sqliteOtpTokenAdapter: OtpTokenPort = {
  async replace(input) {
    db.transaction((tx) => {
      tx.delete(otpTokens).where(eq(otpTokens.email, input.email)).run();
      tx.insert(otpTokens)
        .values({
          email: input.email,
          tokenHash: input.tokenHash,
          expires: input.expiresAt,
          ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        })
        .run();
    });
  },
  async find(email) {
    const row = await db
      .select()
      .from(otpTokens)
      .where(eq(otpTokens.email, email))
      .limit(1)
      .get();
    return row == null
      ? null
      : {
          email: row.email,
          tokenHash: row.tokenHash,
          expiresAt: row.expires,
          attempts: row.attempts,
          lockedUntil: row.lockedUntil,
        };
  },
  async recordFailure(input) {
    await db
      .update(otpTokens)
      .set({
        attempts: input.attempts,
        lastAttemptAt: new Date(),
        ...(input.lockedUntil === undefined ? {} : { lockedUntil: input.lockedUntil }),
      })
      .where(eq(otpTokens.email, input.email));
  },
  async markVerified(email) {
    await db
      .update(otpTokens)
      .set({ verifiedAt: new Date() })
      .where(eq(otpTokens.email, email));
  },
  async delete(email) {
    await db.delete(otpTokens).where(eq(otpTokens.email, email));
  },
  async cleanupExpired(now) {
    return db.delete(otpTokens).where(lt(otpTokens.expires, now)).run().changes;
  },
};

export const sqliteUserAccountAdapter: UserAccountPort = {
  async findOrCreate(email, name) {
    return db.transaction((tx) => {
      const existing = tx
        .select()
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .get();
      if (existing != null) {
        return {
          user: { id: existing.id, email: existing.email, name: existing.name, image: existing.image },
          isExistingUser: true,
        };
      }
      const created = tx
        .insert(users)
        .values({ email, ...(name === undefined ? {} : { name }), emailVerified: new Date() })
        .returning()
        .get();
      return {
        user: { id: created.id, email: created.email, name: created.name, image: created.image },
        isExistingUser: false,
      };
    });
  },
  async findByEmail(email) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.email, email), isNull(users.deletedAt)),
      columns: { id: true, email: true, name: true, image: true },
    });
    return row ?? null;
  },
  async findById(id) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, id), isNull(users.deletedAt)),
      columns: { id: true, email: true, name: true, image: true },
    });
    return row ?? null;
  },
};
