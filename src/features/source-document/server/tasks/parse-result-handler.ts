import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, ledgers } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";
import type { CategoryInfo, ParsedLedgerEntry } from "@/features/ai/types";
import { buildEntriesForInsert, validateEntries, getEntryFallbackDate } from "./entry-builder";

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
  const q = forLedger(sourceDocuments, ledgerId);
  const qEntries = forLedger(ledgerEntries, ledgerId);

  // Query source document to get its entryDate for fallback
  const doc = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, sourceDocumentId), isNull(sourceDocuments.deletedAt)),
  });

  // Handle anomaly - do NOT save entries, just update document status
  if (verificationStatus === "anomaly" || verificationStatus === "invalid") {
    const reason =
      anomalyReason ||
      (verificationStatus === "invalid" ? "Invalid content" : "Parsing results diverged");

    await db
      .update(sourceDocuments)
      .set({
        status: "anomaly",
        anomalyReason: reason,
        title: title || undefined,
      })
      .where(q.whereId(sourceDocumentId));
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
        title: title || undefined,
      })
      .where(q.whereId(sourceDocumentId));
    return;
  }

  const validEntries = parsedEntries.filter((entry) => entry.amount > 0);

  // Get ledger's main currency for conversion
  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
  });
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";

  // Get fallback date
  const { fallbackDate } = getEntryFallbackDate(doc?.entryDate || null);

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
    // 1. Delete existing entries for this source document (enables retry)
    tx.update(ledgerEntries)
      .set({ deletedAt: new Date() })
      .where(and(eq(ledgerEntries.sourceDocumentId, sourceDocumentId), qEntries.whereActive))
      .run();

    // 2. Insert new entries
    if (entriesToInsert.length > 0) {
      tx.insert(ledgerEntries).values(entriesToInsert).run();
    }

    // 3. Update document status to completed and title
    tx.update(sourceDocuments)
      .set({
        status: "completed",
        ...(title ? { title } : {}),
      })
      .where(q.whereId(sourceDocumentId))
      .run();
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
  if (!ledgerId) {
    return;
  }

  const q = forLedger(sourceDocuments, ledgerId);

  // 系统错误时标记为 failed，让用户可以重试
  // anomaly 用于业务异常（用户输入问题），failed 用于系统错误
  await db.update(sourceDocuments).set({ status: "failed" }).where(q.whereId(sourceDocumentId));
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
  if (!ledgerId) {
    return;
  }

  const q = forLedger(sourceDocuments, ledgerId);

  // 软删除文档（取消 = 用户不想要了）
  await db
    .update(sourceDocuments)
    .set({ deletedAt: new Date() })
    .where(q.whereId(sourceDocumentId));
}
