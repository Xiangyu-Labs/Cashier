import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminEntriesInput } from "@/modules/admin/contract-schemas";
import type {
  AdminEntryListItem,
  ListAdminEntriesInput,
  ListAdminEntriesResult,
} from "@/modules/admin/contracts";
import { entryCategories, ledgerEntries, ledgers, users } from "@/persistence";

function parseAdminEntryCursor(cursor: string): { createdAt: Date; id: string; rangeStart: Date | null } {
  const [createdAtRaw, id, rangeStartRaw, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin entry cursor", path: ["cursor"] }],
    });
  }

  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin entry cursor", path: ["cursor"] }],
    });
  }

  let rangeStart: Date | null = null;
  if (rangeStartRaw != null && rangeStartRaw !== "") {
    rangeStart = new Date(rangeStartRaw);
    if (Number.isNaN(rangeStart.getTime())) {
      throw new ValidationError("Validation failed", {
        issues: [{ message: "Invalid admin entry cursor", path: ["cursor"] }],
      });
    }
  }

  return { createdAt, id, rangeStart };
}

function resolveRangeStart(range: "24h" | "7d" | "30d" | "all"): Date | null {
  const now = Date.now();

  switch (range) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function formatAdminEntryCursor(row: { createdAt: Date; id: string }, rangeStart: Date | null): string {
  if (rangeStart == null) {
    return `${row.createdAt.toISOString()}|${row.id}`;
  }

  return `${row.createdAt.toISOString()}|${row.id}|${rangeStart.toISOString()}`;
}

export async function listAdminEntries(
  input: ListAdminEntriesInput = {}
): Promise<ListAdminEntriesResult> {
  await requireSuperAdmin();

  const validated = parseListAdminEntriesInput(input);
  const parsedCursor = validated.cursor != null ? parseAdminEntryCursor(validated.cursor) : null;

  const conditions = [isNull(ledgerEntries.deletedAt)];

  if (validated.currency != null) {
    conditions.push(eq(ledgerEntries.currency, validated.currency));
  }

  if (validated.categoryId != null) {
    conditions.push(eq(ledgerEntries.categoryId, validated.categoryId));
  }

  const rangeStart =
    validated.range === "all" ? null : parsedCursor?.rangeStart ?? resolveRangeStart(validated.range);
  if (rangeStart != null) {
    conditions.push(gte(ledgerEntries.createdAt, rangeStart));
  }

  if (validated.sourceLink === "linked") {
    const linkedCondition = and(
      isNotNull(ledgerEntries.sourceDocumentId),
      ne(ledgerEntries.sourceDocumentId, "")
    );
    if (linkedCondition != null) {
      conditions.push(linkedCondition);
    }
  } else if (validated.sourceLink === "unlinked") {
    const unlinkedCondition = or(
      isNull(ledgerEntries.sourceDocumentId),
      eq(ledgerEntries.sourceDocumentId, "")
    );
    if (unlinkedCondition != null) {
      conditions.push(unlinkedCondition);
    }
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(ledgerEntries.createdAt, parsedCursor.createdAt),
      and(eq(ledgerEntries.createdAt, parsedCursor.createdAt), lt(ledgerEntries.id, parsedCursor.id))
    );

    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: ledgerEntries.id,
      ledgerId: ledgerEntries.ledgerId,
      userEmail: users.email,
      categoryId: ledgerEntries.categoryId,
      categoryName: entryCategories.name,
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      itemName: ledgerEntries.itemName,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .leftJoin(ledgers, and(eq(ledgerEntries.ledgerId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .leftJoin(
      entryCategories,
      and(eq(ledgerEntries.categoryId, entryCategories.id), isNull(entryCategories.deletedAt))
    )
    .where(and(...conditions))
    .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatAdminEntryCursor(lastItem, rangeStart);
    }
  }

  const availableCurrencyRows = await db
    .selectDistinct({ currency: ledgerEntries.currency })
    .from(ledgerEntries)
    .where(and(isNull(ledgerEntries.deletedAt), isNotNull(ledgerEntries.currency), ne(ledgerEntries.currency, "")))
    .orderBy(asc(ledgerEntries.currency));

  const availableCategoryRows = await db
    .selectDistinct({
      id: entryCategories.id,
      name: entryCategories.name,
    })
    .from(ledgerEntries)
    .innerJoin(
      entryCategories,
      and(eq(ledgerEntries.categoryId, entryCategories.id), isNull(entryCategories.deletedAt))
    )
    .where(isNull(ledgerEntries.deletedAt))
    .orderBy(asc(entryCategories.name), asc(entryCategories.id));

  const anyEntryRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgerEntries)
    .where(isNull(ledgerEntries.deletedAt));

  const items: AdminEntryListItem[] = pageRows.map((row) => ({
    id: row.id,
    ledgerId: row.ledgerId,
    userEmail: row.userEmail,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    sourceDocumentId: row.sourceDocumentId,
    amount: row.amount,
    currency: row.currency,
    itemName: row.itemName,
    createdAt: row.createdAt,
  }));

  return {
    items,
    nextCursor,
    availableCurrencies: availableCurrencyRows
      .map((row) => row.currency)
      .filter((currency): currency is string => currency != null && currency !== ""),
    availableCategories: availableCategoryRows.map((row) => ({ id: row.id, name: row.name })),
    hasAnyEntries: (anyEntryRows[0]?.count ?? 0) > 0,
  };
}
