import { and, desc, eq, isNull } from "drizzle-orm";
import type {
  AuthenticationPort,
  CategoryPort,
  CurrencyPort,
  IdempotencyPort,
  LedgerPort,
  ServiceCredentialPort,
  SettingsPort,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/errors";
import {
  currencyRates,
  entryCategories,
  idempotencyRecords,
  ledgers,
  serviceCredentials,
  users,
} from "@/persistence";

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
    return row[0]?.ledgerId ?? null;
  },

  async isOwnedByUser(ledgerId, userId) {
    const row = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)))
      .limit(1);
    return row.length === 1;
  },
};

export const sqliteCategoryAdapter: CategoryPort = {
  async list(ledgerId) {
    const rows = await db
      .select({
        id: entryCategories.id,
        name: entryCategories.name,
        description: entryCategories.description,
        icon: entryCategories.icon,
        sortOrder: entryCategories.sortOrder,
        isEditable: entryCategories.isEditable,
      })
      .from(entryCategories)
      .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)))
      .orderBy(entryCategories.sortOrder, entryCategories.createdAt);
    return rows;
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
};

export const sqliteCurrencyAdapter: CurrencyPort = {
  async convert(amount, from, to) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) throw new ValidationError("Amount must be numeric");
    if (from === to) return amount;
    const [rateRow] = await db
      .select()
      .from(currencyRates)
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
    const credential = await db
      .select({ id: serviceCredentials.id, ledgerId: serviceCredentials.ledgerId })
      .from(serviceCredentials)
      .innerJoin(
        ledgers,
        and(eq(ledgers.id, serviceCredentials.ledgerId), isNull(ledgers.deletedAt))
      )
      .where(and(eq(serviceCredentials.key, key), isNull(serviceCredentials.deletedAt)))
      .limit(1);
    const match = credential[0];
    if (match == null) return null;
    await db
      .update(serviceCredentials)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(serviceCredentials.id, match.id), isNull(serviceCredentials.deletedAt)));
    return match;
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
