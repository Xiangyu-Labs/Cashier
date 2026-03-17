"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { withLedgerAccess } from "@/lib/auth-actions";
import { forLedger } from "@/lib/db/scoped-query";
import { and, inArray } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { type SourceDocumentStatusType } from "@/features/source-document/server/schema";

const VALID_STATUSES: SourceDocumentStatusType[] = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
];

/**
 * Update source document metadata (e.g. title, entryDate)
 */
export const updateSourceDocumentAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceId: string,
    data: { title?: string; entryDate?: string }
  ): Promise<void> => {
    const q = forLedger(sourceDocuments, ledgerId);

    await db
      .update(sourceDocuments)
      .set({ ...data, updatedAt: new Date() })
      .where(q.whereId(sourceId));
  }
);

/**
 * Batch update multiple source documents
 */
export const batchUpdateSourceDocumentsAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceDocumentIds: string[],
    data: { status?: string; title?: string; entryDate?: string }
  ): Promise<void> => {
    if (sourceDocumentIds.length === 0) return;

    const { status } = data;
    if (status && !VALID_STATUSES.includes(status as SourceDocumentStatusType)) {
      throw new ValidationError(`Invalid status: ${status}`);
    }

    const q = forLedger(sourceDocuments, ledgerId);

    await db
      .update(sourceDocuments)
      .set(data as Partial<typeof sourceDocuments.$inferSelect>)
      .where(and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)));
  }
);
