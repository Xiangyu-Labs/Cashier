import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import type { CategoryInfo, ParsedLedgerEntry } from "@/lib/ai/types";
import {
  buildEntriesForInsert,
  validateEntries,
  getEntryFallbackDate,
} from "@/modules/source-document/application/parse-source-document/entry-builder";
import { getLedgerMainCurrency } from "@/modules/ledger/source-document-queries";
import { replaceSourceDocumentLedgerEntries } from "./source-document-ledger-entries";
import {
  deletedSourceDocumentPatch,
  whereSourceDocumentNotDeletedId,
} from "./source-document-state";

export interface HandleParseResultParams {
  ledgerId: string;
  sourceDocumentId: string;
  parsedEntries: ParsedLedgerEntry[];
  title?: string;
  anomalyReason?: string;
  verificationStatus: "passed" | "anomaly" | "invalid";
  categories: CategoryInfo[];
}

/**
 * Handle parse result - update document status and save entries
 * This is the onComplete handler extracted for better maintainability
 */
export async function handleParseResult({
  ledgerId,
  sourceDocumentId,
  parsedEntries,
  title,
  anomalyReason,
  verificationStatus,
  categories,
}: HandleParseResultParams): Promise<void> {
  // Query source document to get its entryDate for fallback
  const doc = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
  });
  if (doc == null) {
    return;
  }

  // Handle anomaly - do NOT save entries, just update document status
  if (verificationStatus === "anomaly" || verificationStatus === "invalid") {
    const reason =
      anomalyReason ??
      (verificationStatus === "invalid" ? "Invalid content" : "Parsing results diverged");

    await db
      .update(sourceDocuments)
      .set({
        status: "anomaly",
        anomalyReason: reason,
        title: title ?? undefined,
      })
      .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId));
    return;
  }

  // Validate entries
  const validation = validateEntries(parsedEntries);
  if (!validation.isValid) {
    await db
      .update(sourceDocuments)
      .set({
        status: "anomaly",
        anomalyReason: validation.reason,
        title: title ?? undefined,
      })
      .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId));
    return;
  }

  // Keep adjustment rows (discounts, fees) even when negative
  const validEntries = parsedEntries.filter((entry) => entry.amount > 0 || entry.isAdjustment === true);

  // Get ledger's main currency for conversion
  const mainCurrency = await getLedgerMainCurrency(ledgerId);

  // Get fallback date
  const { fallbackDate } = getEntryFallbackDate(doc?.entryDate ?? null);

  // Build entries with currency conversion
  const entriesToInsert = await buildEntriesForInsert({
    validEntries,
    categories,
    sourceDocumentId,
    ledgerId,
    mainCurrency,
    fallbackDate,
  });

  // Atomically update entries and document status in a transaction
  db.transaction((tx) => {
    // Guard against delete/parse races: only rewrite entries if the document is still active.
    const completedResult = tx
      .update(sourceDocuments)
      .set({
        status: "completed",
        ...(title != null && title !== "" ? { title } : {}),
      })
      .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
      .run();

    if (completedResult.changes === 0) {
      return;
    }

    replaceSourceDocumentLedgerEntries(tx, ledgerId, sourceDocumentId, entriesToInsert);
  });
}

export interface HandleErrorParams {
  ledgerId?: string;
  sourceDocumentId: string;
  error: Error;
}

/**
 * Handle parse error - update document status to failed
 */
export async function handleParseError({
  ledgerId,
  sourceDocumentId,
  error: _error,
}: HandleErrorParams): Promise<void> {
  if (ledgerId == null || ledgerId === "") {
    return;
  }

  // 系统错误时标记为 failed，让用户可以重试
  // anomaly 用于业务异常（用户输入问题），failed 用于系统错误
  await db
    .update(sourceDocuments)
    .set({ status: "failed" })
    .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId));
}

export interface HandleCancelParams {
  ledgerId?: string;
  sourceDocumentId: string;
}

/**
 * Handle parse cancellation - soft delete document
 */
export async function handleParseCancel({
  ledgerId,
  sourceDocumentId,
}: HandleCancelParams): Promise<void> {
  if (ledgerId == null || ledgerId === "") {
    return;
  }

  // 软删除文档（取消 = 用户不想要了）
  await db
    .update(sourceDocuments)
    .set(deletedSourceDocumentPatch())
    .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId));
}
