import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminSourceDocumentsInput } from "@/modules/admin/contract-schemas";
import type {
  AdminSourceDocumentListItem,
  ListAdminSourceDocumentsInput,
  ListAdminSourceDocumentsResult,
} from "@/modules/admin/contracts";
import { ledgerEntries, ledgers, sourceDocuments, users } from "@/persistence";

function parseSourceDocumentCursor(cursor: string): {
  createdAt: Date;
  id: string;
  rangeStart: Date | null;
} {
  const [createdAtRaw, id, rangeStartRaw, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin source document cursor", path: ["cursor"] }],
    });
  }

  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin source document cursor", path: ["cursor"] }],
    });
  }

  let rangeStart: Date | null = null;
  if (rangeStartRaw != null && rangeStartRaw !== "") {
    rangeStart = new Date(rangeStartRaw);
    if (Number.isNaN(rangeStart.getTime())) {
      throw new ValidationError("Validation failed", {
        issues: [{ message: "Invalid admin source document cursor", path: ["cursor"] }],
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

function formatSourceDocumentCursor(
  row: { createdAt: Date; id: string },
  rangeStart: Date | null
): string {
  if (rangeStart == null) {
    return `${row.createdAt.toISOString()}|${row.id}`;
  }

  return `${row.createdAt.toISOString()}|${row.id}|${rangeStart.toISOString()}`;
}

export async function listAdminSourceDocuments(
  input: ListAdminSourceDocumentsInput = {}
): Promise<ListAdminSourceDocumentsResult> {
  await requireSuperAdmin();

  const validated = parseListAdminSourceDocumentsInput(input);
  const parsedCursor = validated.cursor != null ? parseSourceDocumentCursor(validated.cursor) : null;

  const entryCountSubquery = db
    .select({
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      entryCount: sql<number>`count(*)`.as("entry_count"),
    })
    .from(ledgerEntries)
    .where(and(isNull(ledgerEntries.deletedAt)))
    .groupBy(ledgerEntries.sourceDocumentId)
    .as("entry_count_by_source_document");

  const conditions = [isNull(sourceDocuments.deletedAt)];

  if (validated.status != null) {
    conditions.push(eq(sourceDocuments.status, validated.status));
  }

  if (validated.type != null) {
    conditions.push(eq(sourceDocuments.type, validated.type));
  }

  const rangeStart =
    validated.range === "all" ? null : parsedCursor?.rangeStart ?? resolveRangeStart(validated.range);
  if (rangeStart != null) {
    conditions.push(gte(sourceDocuments.createdAt, rangeStart));
  }

  if (validated.result === "withEntries") {
    conditions.push(sql`coalesce(${entryCountSubquery.entryCount}, 0) > 0`);
  } else if (validated.result === "withoutEntries") {
    conditions.push(sql`coalesce(${entryCountSubquery.entryCount}, 0) = 0`);
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(sourceDocuments.createdAt, parsedCursor.createdAt),
      and(eq(sourceDocuments.createdAt, parsedCursor.createdAt), lt(sourceDocuments.id, parsedCursor.id))
    );

    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: sourceDocuments.id,
      ledgerId: sourceDocuments.ledgerId,
      userEmail: users.email,
      title: sourceDocuments.title,
      status: sourceDocuments.status,
      type: sourceDocuments.type,
      entryDate: sourceDocuments.entryDate,
      entryCount: sql<number>`coalesce(${entryCountSubquery.entryCount}, 0)`,
      anomalyReason: sourceDocuments.anomalyReason,
      createdAt: sourceDocuments.createdAt,
      updatedAt: sourceDocuments.updatedAt,
    })
    .from(sourceDocuments)
    .leftJoin(ledgers, and(eq(sourceDocuments.ledgerId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .leftJoin(
      entryCountSubquery,
      eq(sourceDocuments.id, entryCountSubquery.sourceDocumentId)
    )
    .where(and(...conditions))
    .orderBy(desc(sourceDocuments.createdAt), desc(sourceDocuments.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatSourceDocumentCursor(lastItem, rangeStart);
    }
  }

  const availableTypeRows = await db
    .selectDistinct({ type: sourceDocuments.type })
    .from(sourceDocuments)
    .where(isNull(sourceDocuments.deletedAt))
    .orderBy(asc(sourceDocuments.type));

  const anySourceDocumentRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(sourceDocuments)
    .where(isNull(sourceDocuments.deletedAt));

  const items: AdminSourceDocumentListItem[] = pageRows.map((row) => ({
    id: row.id,
    ledgerId: row.ledgerId,
    userEmail: row.userEmail,
    title: row.title,
    status: row.status,
    type: row.type,
    entryDate: row.entryDate,
    entryCount: row.entryCount,
    anomalyReason: row.anomalyReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return {
    items,
    nextCursor,
    availableTypes: availableTypeRows.map((row) => row.type),
    hasAnySourceDocuments: (anySourceDocumentRows[0]?.count ?? 0) > 0,
  };
}
