import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/persistence/db";
import {
  entryCategories,
  ledgerEntries,
  revisionEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import Decimal from "decimal.js";
import { toStableAnomalyCode, toStableFailureCode } from "@/application/contracts";

export interface CredentialSourceDocumentStatusResult {
  sourceDocumentId: string;
  revisionId: string;
  status: "processing" | "completed" | "anomaly" | "failed" | "cancelled";
  submittedAt: string;
  finalizedAt: string | null;
  entryDate: string | null;
  result: null | {
    title: string | null;
    total: string;
    entries: Array<{
      name: string;
      description: string | null;
      amount: string;
      currency: string | null;
      category: string | null;
    }>;
  };
  error: null | { code: string };
}

export async function getCredentialSourceDocumentStatus(
  ledgerId: string,
  sourceDocumentId: string
): Promise<CredentialSourceDocumentStatusResult | null> {
  const document = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.id, sourceDocumentId),
      eq(sourceDocuments.ledgerId, ledgerId),
      isNull(sourceDocuments.deletedAt)
    ),
  });
  if (document == null || document.status === "deleted") return null;

  const revisionId = document.pendingRevisionId ?? document.activeRevisionId;
  if (revisionId == null) return null;
  const revision = await db.query.sourceDocumentRevisions.findFirst({
    where: and(
      eq(sourceDocumentRevisions.id, revisionId),
      eq(sourceDocumentRevisions.sourceDocumentId, document.id),
      eq(sourceDocumentRevisions.ledgerId, ledgerId)
    ),
  });
  if (revision == null || revision.outcome === "abandoned") return null;

  const status = revision.outcome as CredentialSourceDocumentStatusResult["status"];
  let result: CredentialSourceDocumentStatusResult["result"] = null;
  if (status === "completed") {
    const rows = await db
      .select({
        name: ledgerEntries.itemName,
        description: ledgerEntries.description,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        category: entryCategories.name,
      })
      .from(revisionEntries)
      .innerJoin(
        ledgerEntries,
        and(
          eq(ledgerEntries.id, revisionEntries.ledgerEntryId),
          eq(ledgerEntries.ledgerId, ledgerId),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .leftJoin(entryCategories, eq(entryCategories.id, ledgerEntries.categoryId))
      .where(
        and(eq(revisionEntries.revisionId, revision.id), eq(revisionEntries.ledgerId, ledgerId))
      )
      .orderBy(asc(revisionEntries.position));
    const total = rows.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
    result = { title: document.title, total: total.toFixed(2), entries: rows };
  }

  const error =
    status === "failed"
      ? { code: toStableFailureCode(revision.failureCode) }
      : status === "anomaly"
        ? { code: toStableAnomalyCode(revision.anomalyReason) }
        : null;
  return {
    sourceDocumentId: document.id,
    revisionId: revision.id,
    status,
    submittedAt: revision.submittedAt.toISOString(),
    finalizedAt: revision.finalizedAt?.toISOString() ?? null,
    entryDate: document.entryDate,
    result,
    error,
  };
}
