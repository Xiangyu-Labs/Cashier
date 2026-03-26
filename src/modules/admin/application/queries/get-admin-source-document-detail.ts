import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import type { AdminSourceDocumentDetail } from "@/modules/admin/contracts";
import { SourceDocumentStatus } from "@/modules/source-document/types";
import { ledgerEntries, ledgers, sourceDocuments, users } from "@/persistence";

const adminSourceDocumentIdSchema = z.string().trim().min(1);

function parseAdminSourceDocumentId(input: unknown): string {
  const result = adminSourceDocumentIdSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

function visibleSourceDocumentCondition() {
  return and(ne(sourceDocuments.status, SourceDocumentStatus.Deleted), isNull(sourceDocuments.deletedAt))!;
}

export async function getAdminSourceDocumentDetail(
  input: unknown
): Promise<AdminSourceDocumentDetail> {
  await requireSuperAdmin();

  const sourceDocumentId = parseAdminSourceDocumentId(input);

  const entryCountSubquery = db
    .select({
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      entryCount: sql<number>`count(*)`.as("entry_count"),
    })
    .from(ledgerEntries)
    .where(and(isNull(ledgerEntries.deletedAt)))
    .groupBy(ledgerEntries.sourceDocumentId)
    .as("entry_count_by_source_document");

  const rows = await db
    .select({
      id: sourceDocuments.id,
      ledgerId: sourceDocuments.ledgerId,
      userEmail: users.email,
      title: sourceDocuments.title,
      text: sourceDocuments.text,
      imageUrls: sourceDocuments.imageUrls,
      status: sourceDocuments.status,
      type: sourceDocuments.type,
      anomalyReason: sourceDocuments.anomalyReason,
      entryDate: sourceDocuments.entryDate,
      metadata: sourceDocuments.metadata,
      entryCount: sql<number>`coalesce(${entryCountSubquery.entryCount}, 0)`,
      createdAt: sourceDocuments.createdAt,
      updatedAt: sourceDocuments.updatedAt,
      deletedAt: sourceDocuments.deletedAt,
    })
    .from(sourceDocuments)
    .leftJoin(ledgers, and(eq(sourceDocuments.ledgerId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .leftJoin(
      entryCountSubquery,
      eq(sourceDocuments.id, entryCountSubquery.sourceDocumentId)
    )
    .where(and(eq(sourceDocuments.id, sourceDocumentId), visibleSourceDocumentCondition()))
    .limit(1);

  const row = rows[0];
  if (row == null) {
    throw new NotFoundError("Source document");
  }

  return {
    ...row,
    status: row.status as AdminSourceDocumentDetail["status"],
    imageUrls: row.imageUrls ?? [],
    metadata: row.metadata ?? {},
  };
}
