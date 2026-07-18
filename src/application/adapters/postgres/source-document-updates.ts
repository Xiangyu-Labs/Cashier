import { db } from "@/lib/db";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import type {
  BatchUpdateSourceDocumentsResultDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type {
  BatchUpdateSourceDocumentsInput as BatchUpdateSourceDocumentsPayload,
  UpdateSourceDocumentInput as UpdateSourceDocumentPayload,
} from "@/modules/source-document/contract-schemas";
import { lockSourceDocumentForUpdate } from "./transaction-locks";

function whereSourceDocumentNotDeleted(ledgerId: string) {
  return and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt))!;
}

function whereSourceDocumentNotDeletedId(ledgerId: string, sourceDocumentId: string) {
  return and(whereSourceDocumentNotDeleted(ledgerId), eq(sourceDocuments.id, sourceDocumentId))!;
}

interface UpdateSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  data: UpdateSourceDocumentPayload;
}

interface BatchUpdateSourceDocumentsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
  data: BatchUpdateSourceDocumentsPayload;
}

export async function updateSourceDocument({
  ledgerId,
  sourceDocumentId,
  data,
}: UpdateSourceDocumentInput): Promise<UpdateSourceDocumentResultDto> {
  const document = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
  });
  if (document == null) {
    return { sourceDocumentId, updated: false };
  }

  if (document.type === "manual" && document.activeRevisionId != null) {
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, ledgerId),
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
      orderBy: (entries, { asc }) => [asc(entries.createdAt), asc(entries.id)],
    });
    await postgresLedgerProjectionAdapter.replaceManual({
      ledgerId,
      sourceDocumentId,
      expectedActiveRevisionId: document.activeRevisionId,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
      entries: activeEntries.map((entry) => ({
        id: entry.id,
        categoryId: entry.categoryId,
        amount: entry.amount,
        currency: entry.currency,
        itemName: entry.itemName,
        description: entry.description,
        convertedAmount: entry.convertedAmount,
        exchangeRate: entry.exchangeRate,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
    return { sourceDocumentId, updated: true };
  }

  const updatePatch = {
    updatedAt: new Date(),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
  };

  // Use a source-document lock to serialise with concurrent delete / retry / accept / abandon.
  const updatedDocuments = await db.transaction(async (tx) => {
    await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    return tx
      .update(sourceDocuments)
      .set(updatePatch)
      .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
      .returning({ id: sourceDocuments.id });
  });

  return {
    sourceDocumentId,
    updated: updatedDocuments.length > 0,
  };
}

export async function batchUpdateSourceDocuments({
  ledgerId,
  sourceDocumentIds,
  data,
}: BatchUpdateSourceDocumentsInput): Promise<BatchUpdateSourceDocumentsResultDto> {
  if (sourceDocumentIds.length === 0) {
    return {
      sourceDocumentIds,
      updatedCount: 0,
    };
  }

  const updatePatch = {
    updatedAt: new Date(),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
  };

  const updatedDocuments = await db
    .update(sourceDocuments)
    .set(updatePatch)
    .where(
      and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds))
    )
    .returning({ id: sourceDocuments.id });

  return {
    sourceDocumentIds,
    updatedCount: updatedDocuments.length,
  };
}
