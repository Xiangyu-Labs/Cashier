import { and, asc, eq, isNull } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/persistence/db";
import {
  entryCategories,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { toStableAnomalyCode, toStableFailureCode } from "@/application/contracts";
import type {
  CredentialSourceDocumentReadPort,
  CredentialSourceDocumentStatusResult,
} from "@/modules/source-document/application/ports";

export const postgresCredentialSourceDocumentReadAdapter: CredentialSourceDocumentReadPort = {
  async getStatus(ledgerId, sourceDocumentId) {
    const document = await db.query.sourceDocuments.findFirst({
      where: and(
        eq(sourceDocuments.id, sourceDocumentId),
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt)
      ),
    });
    if (document == null) return null;
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
        .from(ledgerEntries)
        .leftJoin(entryCategories, eq(entryCategories.id, ledgerEntries.categoryId))
        .where(
          and(
            eq(ledgerEntries.sourceDocumentRevisionId, revision.id),
            eq(ledgerEntries.ledgerId, ledgerId),
            isNull(ledgerEntries.deletedAt)
          )
        )
        .orderBy(asc(ledgerEntries.position));
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
  },
};
