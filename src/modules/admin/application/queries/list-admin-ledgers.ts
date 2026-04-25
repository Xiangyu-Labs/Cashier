import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminLedgersInput } from "@/modules/admin/contract-schemas";
import type {
  AdminLedgerListItem,
  ListAdminLedgersInput,
  ListAdminLedgersResult,
} from "@/modules/admin/contracts";
import { ledgers, users } from "@/persistence";

function parseLedgerCursor(cursor: string): { createdAt: Date; id: string; rangeStart: Date | null } {
  const [createdAtRaw, id, rangeStartRaw, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin ledger cursor", path: ["cursor"] }],
    });
  }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin ledger cursor", path: ["cursor"] }],
    });
  }
  let rangeStart: Date | null = null;
  if (rangeStartRaw != null && rangeStartRaw !== "") {
    rangeStart = new Date(rangeStartRaw);
    if (Number.isNaN(rangeStart.getTime())) {
      throw new ValidationError("Validation failed", {
        issues: [{ message: "Invalid admin ledger cursor", path: ["cursor"] }],
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

function formatLedgerCursor(row: { createdAt: Date; id: string }, rangeStart: Date | null): string {
  if (rangeStart == null) {
    return `${row.createdAt.toISOString()}|${row.id}`;
  }
  return `${row.createdAt.toISOString()}|${row.id}|${rangeStart.toISOString()}`;
}

export async function listAdminLedgers(
  input: ListAdminLedgersInput = {}
): Promise<ListAdminLedgersResult> {
  await requireSuperAdmin();

  const validated = parseListAdminLedgersInput(input);
  const conditions = [isNull(ledgers.deletedAt)];
  const parsedCursor = validated.cursor != null ? parseLedgerCursor(validated.cursor) : null;

  const rangeStart =
    validated.range === "all" ? null : parsedCursor?.rangeStart ?? resolveRangeStart(validated.range);
  if (rangeStart != null) {
    conditions.push(gte(ledgers.createdAt, rangeStart));
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(ledgers.createdAt, parsedCursor.createdAt),
      and(eq(ledgers.createdAt, parsedCursor.createdAt), lt(ledgers.id, parsedCursor.id))
    );
    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: ledgers.id,
      userId: ledgers.userId,
      userEmail: users.email,
      metadata: ledgers.metadata,
      createdAt: ledgers.createdAt,
    })
    .from(ledgers)
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .where(and(...conditions))
    .orderBy(desc(ledgers.createdAt), desc(ledgers.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatLedgerCursor(lastItem, rangeStart);
    }
  }

  const anyLedgerRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledgers)
    .where(isNull(ledgers.deletedAt));

  const items: AdminLedgerListItem[] = pageRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    userEmail: row.userEmail,
    mainCurrency:
      typeof row.metadata === "object" && row.metadata != null
        ? (row.metadata as { settings?: { mainCurrency?: string } }).settings?.mainCurrency ?? null
        : null,
    createdAt: row.createdAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyLedgers: (anyLedgerRows[0]?.count ?? 0) > 0,
  };
}
