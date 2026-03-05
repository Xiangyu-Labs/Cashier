/**
 * Get Heatmap For Range Action
 *
 * Fetches heatmap data for a custom date range.
 */

'use server';

import { db } from '@/lib/db';
import { ledgerEntries } from '@/features/ledger/server/schema';
import { sourceDocuments } from '@/features/source-document/server/schema';
import { requireLedgerAccess } from '@/features/auth/server/utils/helpers';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { GetCalendarHeatmapForRangeSchema } from './schemas';
import { normalizeDate, calculateStats } from './utils';
import type { CalendarHeatmapData, CalendarDayData } from '../../types';
import type { z } from 'zod';

export async function getCalendarHeatmapForRange(
    input: z.infer<typeof GetCalendarHeatmapForRangeSchema>
): Promise<CalendarHeatmapData> {
    const { ledgerId, startDate, endDate, filters } = GetCalendarHeatmapForRangeSchema.parse(input);

    await requireLedgerAccess(ledgerId);

    const conditions = [
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt),
        sql`${sourceDocuments.entryDate} >= ${startDate} AND ${sourceDocuments.entryDate} <= ${endDate}`,
    ];

    if (filters?.currency) {
        conditions.push(eq(ledgerEntries.currency, filters.currency));
    }
    if (filters?.categoryId) {
        conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
    }

    const results = await db
        .select({
            date: sourceDocuments.entryDate,
            total: sql<string>`COALESCE(SUM(CAST(COALESCE(${ledgerEntries.convertedAmount}, ${ledgerEntries.amount}) AS REAL)), 0)`,
            count: sql<number>`COUNT(*)`,
            currencies: sql<string>`GROUP_CONCAT(DISTINCT ${ledgerEntries.currency})`,
        })
        .from(ledgerEntries)
        .innerJoin(sourceDocuments, eq(ledgerEntries.sourceDocumentId, sourceDocuments.id))
        .where(and(...conditions))
        .groupBy(sourceDocuments.entryDate)
        .orderBy(sourceDocuments.entryDate);

    const days: CalendarDayData[] = results
        .filter((row) => row.date !== null)
        .map((row) => ({
            date: normalizeDate(row.date!),
            totalAmount: parseFloat(row.total) || 0,
            entryCount: row.count,
            currencies: row.currencies ? row.currencies.split(',').filter(Boolean) : [],
        }));

    const amounts = days.map((d) => d.totalAmount).filter((a) => a > 0);
    const stats = calculateStats(amounts);

    return {
        days,
        range: { startDate, endDate },
        stats,
    };
}
