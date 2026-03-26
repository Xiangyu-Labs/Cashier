import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import type { AdminEntryDetail } from "@/modules/admin/contracts";
import { SourceDocumentStatus } from "@/modules/source-document/types";
import { entryCategories, ledgerEntries, ledgers, sourceDocuments, users } from "@/persistence";

const adminEntryIdSchema = z.string().trim().min(1);

function parseAdminEntryId(input: unknown): string {
  const result = adminEntryIdSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }

  return result.data;
}

function visibleSourceDocumentCondition() {
  return and(ne(sourceDocuments.status, SourceDocumentStatus.Deleted), isNull(sourceDocuments.deletedAt))!;
}

export async function getAdminEntryDetail(input: unknown): Promise<AdminEntryDetail> {
  await requireSuperAdmin();

  const entryId = parseAdminEntryId(input);

  const rows = await db
    .select({
      id: ledgerEntries.id,
      ledgerId: ledgerEntries.ledgerId,
      userEmail: users.email,
      categoryId: ledgerEntries.categoryId,
      categoryName: entryCategories.name,
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      sourceDocumentTitle: sourceDocuments.title,
      sourceDocumentStatus: sourceDocuments.status,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      itemName: ledgerEntries.itemName,
      description: ledgerEntries.description,
      convertedAmount: ledgerEntries.convertedAmount,
      exchangeRate: ledgerEntries.exchangeRate,
      createdAt: ledgerEntries.createdAt,
      updatedAt: ledgerEntries.updatedAt,
      deletedAt: ledgerEntries.deletedAt,
    })
    .from(ledgerEntries)
    .leftJoin(ledgers, and(eq(ledgerEntries.ledgerId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .leftJoin(
      entryCategories,
      and(eq(ledgerEntries.categoryId, entryCategories.id), isNull(entryCategories.deletedAt))
    )
    .leftJoin(
      sourceDocuments,
      and(eq(ledgerEntries.sourceDocumentId, sourceDocuments.id), visibleSourceDocumentCondition())
    )
    .where(and(eq(ledgerEntries.id, entryId), isNull(ledgerEntries.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (row == null) {
    throw new NotFoundError("Entry");
  }

  return {
    ...row,
    sourceDocumentStatus:
      row.sourceDocumentStatus as Exclude<AdminEntryDetail["sourceDocumentStatus"], undefined>,
  };
}
