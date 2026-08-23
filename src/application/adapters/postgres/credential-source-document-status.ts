import { and, eq, isNull, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/persistence/db";
import { ledgers, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import { toStableAnomalyCode, toStableFailureCode } from "@/application/contracts";
import { AppError } from "@/lib/errors";
import { roundToCurrency } from "@/lib/money/currency-precision";
import type {
  CredentialSourceDocumentReadPort,
  CredentialSourceDocumentStatusResult,
} from "@/modules/source-document/application/ports";

export const postgresCredentialSourceDocumentReadAdapter: CredentialSourceDocumentReadPort = {
  async getStatus(ledgerId, sourceDocumentId) {
    // Load the document, its selected revision (pending ?? active), and the
    // ledger's main currency in a single query so status polling does not fan
    // out into three sequential reads. The revision must belong to both the
    // document and the same ledger.
    const selectedRevisionId = sql<string>`COALESCE(${sourceDocuments.pendingRevisionId}, ${sourceDocuments.activeRevisionId})`;
    const rows = await db
      .select({
        document: sourceDocuments,
        revision: sourceDocumentRevisions,
        mainCurrency: ledgers.mainCurrency,
        entries: sql<
          Array<{
            name: string;
            description: string | null;
            amount: string;
            currency: string | null;
            convertedAmount: string | null;
            category: string | null;
          }>
        >`COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', entry.item_name,
            'description', entry.description,
            'amount', entry.amount,
            'currency', entry.currency,
            'convertedAmount', entry.converted_amount,
            'category', category.name
          ) ORDER BY entry.position, entry.created_at, entry.id)
          FROM ledger_entries entry
          LEFT JOIN entry_categories category ON category.id = entry.category_id
          WHERE entry.source_document_revision_id = ${selectedRevisionId}
            AND entry.ledger_id = ${ledgerId}
            AND entry.deleted_at IS NULL
        ), '[]'::jsonb)`,
      })
      .from(sourceDocuments)
      .innerJoin(
        sourceDocumentRevisions,
        and(
          eq(sourceDocumentRevisions.id, selectedRevisionId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocuments.id),
          eq(sourceDocumentRevisions.ledgerId, ledgerId)
        )
      )
      .innerJoin(ledgers, eq(ledgers.id, sourceDocuments.ledgerId))
      .where(
        and(
          eq(sourceDocuments.id, sourceDocumentId),
          eq(sourceDocuments.ledgerId, ledgerId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .limit(1);
    const row = rows[0];
    if (row == null) return null;
    const { document, revision } = row;
    if (revision.outcome === "abandoned") return null;

    // Keep the legacy credential API's processing response while a human
    // decision is pending, even though the internal accounting projection is
    // already active and included in all ledger statistics.
    const status =
      document.currentStatus === "duplicate_pending" ||
      document.currentStatus === "candidate_pending"
        ? "processing"
        : (revision.outcome as CredentialSourceDocumentStatusResult["status"]);
    let result: CredentialSourceDocumentStatusResult["result"] = null;
    if (status === "completed" && document.activeRevisionId != null) {
      const total = row.entries.reduce((sum, entry) => {
        if (entry.convertedAmount == null) {
          // Accounting totals may only be derived from converted amounts.
          // Falling back to raw amounts would silently mix currencies.
          throw new AppError(
            "Completed source document has entries without accounting amounts",
            "ACCOUNTING_AMOUNT_UNAVAILABLE",
            500
          );
        }
        return sum.plus(entry.convertedAmount);
      }, new Decimal(0));
      result = {
        title: document.title,
        total: roundToCurrency(total.toFixed(), row.mainCurrency),
        totalCurrency: row.mainCurrency,
        entries: row.entries.map(({ name, description, amount, currency, category }) => ({
          name,
          description,
          amount,
          currency,
          category,
        })),
      };
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
