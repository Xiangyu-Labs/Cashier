"use server";

import { db } from "@/lib/db";
import { ledgerEntries, ledgers, sourceDocuments } from "@/lib/db/schema";
import { z } from "zod";
import { eq, inArray, and, or, lt, isNull, sql } from "drizzle-orm";
import { withLedgerAccess } from "@/lib/auth-actions";
import { CurrencyService } from "@/features/currency/server/service";
import { type SerializedLedgerEntry, serializeLedgerEntry } from "@/lib/serialization";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const createLedgerEntrySchema = z.object({
  amount: z.number(),
  currency: z.string().optional(),
  itemName: z.string().min(1),
  categoryId: z.string().optional(),
  description: z.string().optional().nullable(),
  sourceDocumentId: z.string(),
});

const updateLedgerEntrySchema = z.object({
  categoryId: z.string().nullable().optional(),
  amount: z.number().optional(),
  currency: z.string().nullable().optional(),
  itemName: z.string().optional(),
  description: z.string().nullable().optional(),
});

// Schema for batch update validation
const batchUpdateLedgerEntriesSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    currency: z.string().length(3).nullable().optional(), // ISO 4217 currency code
    amount: z.number().positive().optional(),
    description: z.string().max(500).nullable().optional(),
    itemName: z.string().min(1).max(200).optional(),
  })
  .strict(); // Reject unknown keys

import { forLedger } from "@/lib/db/scoped-query";
import type { LedgerEntry } from "@/lib/db/schema";
// Date string comparison - no need for date parsing utilities

export const createLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, data: z.infer<typeof createLedgerEntrySchema>): Promise<LedgerEntry> => {
    const validated = createLedgerEntrySchema.parse(data);

    // Get ledger's main currency and source document's entryDate
    const ledger = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });
    const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";
    const entryCurrency = validated.currency || "CNY";

    // Get entryDate from source document for currency conversion
    const sourceDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, validated.sourceDocumentId),
    });
    const entryDate = sourceDoc?.entryDate || undefined;

    // Calculate converted amount using CurrencyService
    const conversionResult = await CurrencyService.convertEntryAmount({
      amount: validated.amount,
      fromCurrency: entryCurrency,
      toCurrency: mainCurrency,
      date: entryDate,
    });

    const convertedAmount = conversionResult?.convertedAmount ?? null;
    const exchangeRate = conversionResult?.exchangeRate ?? null;

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        amount: validated.amount.toFixed(2),
        ledgerId: ledgerId,
        sourceDocumentId: validated.sourceDocumentId,
        itemName: validated.itemName,
        currency: entryCurrency,
        categoryId: validated.categoryId,
        description: validated.description,
        convertedAmount,
        exchangeRate,
      })
      .returning();

    return entry;
  }
);

export const updateLedgerEntryAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryId: string,
    data: z.infer<typeof updateLedgerEntrySchema>
  ): Promise<SerializedLedgerEntry> => {
    const validated = updateLedgerEntrySchema.parse(data);
    const q = forLedger(ledgerEntries, ledgerId);

    // Use precise type for update data instead of Record<string, unknown>
    // This ensures type safety for database update operations
    const updateData: Partial<{
      categoryId: string | null;
      amount: string;
      currency: string | null;
      itemName: string;
      description: string | null;
      updatedAt: Date;
      convertedAmount: string;
      exchangeRate: string;
    }> = {};
    if (validated.categoryId !== undefined) updateData.categoryId = validated.categoryId;
    if (validated.amount !== undefined) updateData.amount = validated.amount.toFixed(2);
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.itemName !== undefined) updateData.itemName = validated.itemName;
    if (validated.description !== undefined) updateData.description = validated.description;
    updateData.updatedAt = new Date();

    // If amount or currency changed, recalculate convertedAmount
    if (validated.amount !== undefined || validated.currency !== undefined) {
      // Get current entry and ledger for calculation
      // Include ledgerId in query to prevent IDOR
      const [currentEntry, ledger] = await Promise.all([
        db.query.ledgerEntries.findFirst({
          where: and(
            eq(ledgerEntries.id, ledgerEntryId),
            eq(ledgerEntries.ledgerId, ledgerId),
            isNull(ledgerEntries.deletedAt)
          ),
          with: { sourceDocument: true },
        }),
        db.query.ledgers.findFirst({
          where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
        }),
      ]);

      if (currentEntry) {
        const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";
        const newAmount = validated.amount ?? Number(currentEntry.amount);
        const newCurrency = validated.currency ?? currentEntry.currency ?? "CNY";
        // Get entryDate from source document
        const entryDate = currentEntry.sourceDocument?.entryDate || undefined;

        // Calculate converted amount using CurrencyService
        const conversionResult = await CurrencyService.convertEntryAmount({
          amount: newAmount,
          fromCurrency: newCurrency,
          toCurrency: mainCurrency,
          date: entryDate,
        });

        if (conversionResult) {
          updateData.convertedAmount = conversionResult.convertedAmount;
          updateData.exchangeRate = conversionResult.exchangeRate;
        }
      }
    }

    const [updatedEntry] = await db
      .update(ledgerEntries)
      .set(updateData)
      .where(q.whereId(ledgerEntryId))
      .returning();

    if (!updatedEntry) throw new NotFoundError("Entry");

    return serializeLedgerEntry(updatedEntry);
  }
);

export const deleteLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, ledgerEntryId: string): Promise<void> => {
    const q = forLedger(ledgerEntries, ledgerId);
    await db.update(ledgerEntries).set(q.softDelete).where(q.whereId(ledgerEntryId));
  }
);

export const batchDeleteLedgerEntriesAction = withLedgerAccess(
  async (ledgerId: string, ledgerEntryIds: string[]): Promise<void> => {
    const q = forLedger(ledgerEntries, ledgerId);

    await db
      .update(ledgerEntries)
      .set(q.softDelete)
      .where(and(q.whereActive, inArray(ledgerEntries.id, ledgerEntryIds)));
  }
);

export const batchUpdateLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryIds: string[],
    data: z.infer<typeof batchUpdateLedgerEntriesSchema>
  ): Promise<void> => {
    // Validate input with Zod
    const validated = batchUpdateLedgerEntriesSchema.parse(data);

    // Build update data from validated input
    const updateData: Partial<typeof ledgerEntries.$inferSelect> = {};
    if (validated.categoryId !== undefined) updateData.categoryId = validated.categoryId;
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.amount !== undefined) updateData.amount = String(validated.amount);
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.itemName !== undefined) updateData.itemName = validated.itemName;
    updateData.updatedAt = new Date();

    const q = forLedger(ledgerEntries, ledgerId);

    await db
      .update(ledgerEntries)
      .set(updateData)
      .where(and(q.whereActive, inArray(ledgerEntries.id, ledgerEntryIds)));

    // If currency was updated, recalculate converted amounts for affected entries
    if (validated.currency !== undefined) {
      const { recalculateEntriesConvertedAmount } =
        await import("@/features/ledger/server/actions/helpers");
      const ledger = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
        columns: { metadata: true },
      });
      const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";
      recalculateEntriesConvertedAmount(ledgerId, mainCurrency).catch((err) => {
        logger.error({ err, ledgerId }, "Failed to recalculate after batch currency update");
      });
    }
  }
);

export const getLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    params: {
      limit?: number;
      cursor?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      categoryId?: string | null;
      currency?: string | null;
      minAmount?: number | null;
      maxAmount?: number | null;
    }
  ) => {
    const q = forLedger(ledgerEntries, ledgerId);
    const limit = params.limit ?? 20;

    // Build conditions
    const conditions = [q.whereActive];
    // Date filtering now uses sourceDocument.entryDate via subquery
    if (params.startDate) {
      conditions.push(
        sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date >= ${params.startDate} AND deleted_at IS NULL
            )`
      );
    }
    if (params.endDate) {
      conditions.push(
        sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date <= ${params.endDate} AND deleted_at IS NULL
            )`
      );
    }
    if (params.categoryId) conditions.push(eq(ledgerEntries.categoryId, params.categoryId));
    if (params.currency) conditions.push(eq(ledgerEntries.currency, params.currency));
    // Filter by convertedAmount (main currency) for price range filtering
    // Use CAST to compare as numbers, not strings
    if (params.minAmount !== undefined && params.minAmount !== null) {
      conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) >= ${params.minAmount}`);
    }
    if (params.maxAmount !== undefined && params.maxAmount !== null) {
      conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) <= ${params.maxAmount}`);
    }

    // Handle cursor with precise composite condition
    // Cursor format: "createdAt|id" (simplified since entryDate is now on sourceDocument)
    // Order: (createdAt DESC, id DESC)
    if (params.cursor) {
      const parts = params.cursor.split("|");
      if (parts.length === 2 && parts[0] && parts[1]) {
        const [cursorCreated, cursorId] = parts;
        conditions.push(
          or(
            lt(ledgerEntries.createdAt, new Date(cursorCreated)),
            and(
              eq(ledgerEntries.createdAt, new Date(cursorCreated)),
              lt(ledgerEntries.id, cursorId)
            )
          )!
        );
      }
    }

    // Single query with precise conditions
    const items = await db.query.ledgerEntries.findMany({
      where: and(...conditions),
      orderBy: (entries, { desc }) => [desc(entries.createdAt), desc(entries.id)],
      limit: limit + 1,
      with: {
        category: true,
        sourceDocument: true,
      },
    });

    // Determine next cursor
    let nextCursor: string | undefined = undefined;
    let resultItems = items;

    if (items.length > limit) {
      const nextItem = items[limit];
      nextCursor = `${nextItem.createdAt.toISOString()}|${nextItem.id}`;
      resultItems = items.slice(0, limit);
    }

    // Use unified serialization
    const serializedItems = resultItems.map((item) => {
      const serialized = serializeLedgerEntry({
        ...item,
        category: item.category,
        sourceDocument: item.sourceDocument
          ? {
              id: item.sourceDocument.id,
              title: item.sourceDocument.title,
            }
          : undefined,
      });

      // Strip large metadata fields from sourceDocument to reduce payload size
      if (serialized.sourceDocument) {
        const { visionDescription: _visionDescription, ...lightMetadata } =
          serialized.sourceDocument.metadata || {};
        serialized.sourceDocument = {
          ...serialized.sourceDocument,
          metadata: lightMetadata,
          imageUrls: [],
          hasImages: (item.sourceDocument?.imageUrls?.length || 0) > 0,
        };
      }

      return serialized;
    });

    return {
      items: serializedItems,
      nextCursor,
    };
  }
);
