/**
 * Calendar Heatmap Server Actions
 *
 * Server-side data fetching for calendar heatmap visualization.
 */

'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { ledgerEntries } from '@/features/ledger/server/schema';
import { sourceDocuments } from '@/features/source-document/server/schema';
import { entryCategories } from '@/features/ledger/server/schema';
import { requireLedgerAccess } from '@/features/auth/server/utils/helpers';
import { and, eq, isNull, sql, between, gte, lte } from 'drizzle-orm';
import type {
    CalendarHeatmapData,
    CalendarDayData,
    CalendarDayDetailResponse,
    CalendarDayDetailEntry,
    CalendarViewType,
    CalendarFilters,
} from '../../types';

// Validation schemas
const GetCalendarHeatmapSchema = z.object({
    ledgerId: z.string(),
    viewType: z.enum(['month', 'year']),
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    filters: z
        .object({
            currency: z.string().optional(),
            categoryId: z.string().optional(),
        })
        .optional(),
});

const GetDayDetailSchema = z.object({
    ledgerId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    filters: z
        .object({
            currency: z.string().optional(),
            categoryId: z.string().optional(),
        })
        .optional(),
});

/**
 * Calculate date range based on view type and anchor date
 */
function getDateRange(
    viewType: CalendarViewType,
    anchorDate: string
): { startDate: string; endDate: string } {
    const [year, month, day] = anchorDate.split('-').map(Number);

    switch (viewType) {
        case 'month': {
            // Get all days in the month
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            return {
                startDate: `${year}-${String(month).padStart(2, '0')}-01`,
                endDate: `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
            };
        }
        case 'year': {
            return {
                startDate: `${year}-01-01`,
                endDate: `${year}-12-31`,
            };
        }
    }
}

function formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Get calendar heatmap data for a specific view
 */
export async function getCalendarHeatmapData(
    input: z.infer<typeof GetCalendarHeatmapSchema>
): Promise<CalendarHeatmapData> {
    const { ledgerId, viewType, anchorDate, filters } = GetCalendarHeatmapSchema.parse(input);

    // Verify ledger access
    await requireLedgerAccess(ledgerId);

    const { startDate, endDate } = getDateRange(viewType, anchorDate);

    // Build base conditions
    const conditions = [
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt),
        between(sourceDocuments.entryDate, startDate, endDate),
    ];

    // Add optional filters
    if (filters?.currency) {
        conditions.push(eq(ledgerEntries.currency, filters.currency));
    }
    if (filters?.categoryId) {
        conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
    }

    // Query aggregated data by date
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

    // Transform to day data (filter out null dates)
    const days: CalendarDayData[] = results
        .filter((row) => row.date !== null)
        .map((row) => ({
            date: row.date!,
            totalAmount: parseFloat(row.total) || 0,
            entryCount: row.count,
            currencies: row.currencies ? row.currencies.split(',').filter(Boolean) : [],
        }));

    // Calculate stats for color mapping
    const amounts = days.map((d) => d.totalAmount).filter((a) => a > 0);
    const stats = calculateStats(amounts);

    return {
        days,
        range: { startDate, endDate },
        stats,
    };
}

/**
 * Get detailed entries for a specific date
 */
export async function getCalendarDayDetail(
    input: z.infer<typeof GetDayDetailSchema>
): Promise<CalendarDayDetailResponse> {
    const { ledgerId, date, filters } = GetDayDetailSchema.parse(input);

    // Verify ledger access
    await requireLedgerAccess(ledgerId);

    // Build base conditions
    const conditions = [
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt),
        eq(sourceDocuments.entryDate, date),
    ];

    // Add optional filters
    if (filters?.currency) {
        conditions.push(eq(ledgerEntries.currency, filters.currency));
    }
    if (filters?.categoryId) {
        conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
    }

    // Query detailed entries
    const results = await db
        .select({
            id: ledgerEntries.id,
            itemName: ledgerEntries.itemName,
            amount: ledgerEntries.amount,
            currency: ledgerEntries.currency,
            convertedAmount: ledgerEntries.convertedAmount,
            categoryId: ledgerEntries.categoryId,
            categoryName: entryCategories.name,
            categoryIcon: entryCategories.icon,
            sourceDocumentId: ledgerEntries.sourceDocumentId,
            sourceDocumentTitle: sourceDocuments.title,
        })
        .from(ledgerEntries)
        .innerJoin(sourceDocuments, eq(ledgerEntries.sourceDocumentId, sourceDocuments.id))
        .leftJoin(entryCategories, eq(ledgerEntries.categoryId, entryCategories.id))
        .where(and(...conditions))
        .orderBy(ledgerEntries.createdAt);

    const entries: CalendarDayDetailEntry[] = results.map((row) => ({
        id: row.id,
        itemName: row.itemName,
        amount: parseFloat(row.amount) || 0,
        currency: row.currency || '',
        convertedAmount: row.convertedAmount ? parseFloat(row.convertedAmount) : undefined,
        categoryId: row.categoryId || undefined,
        categoryName: row.categoryName || undefined,
        categoryIcon: row.categoryIcon || undefined,
        sourceDocumentId: row.sourceDocumentId,
        sourceDocumentTitle: row.sourceDocumentTitle || undefined,
    }));

    const totalAmount = entries.reduce((sum, e) => sum + (e.convertedAmount || e.amount), 0);

    return {
        date,
        entries,
        totalAmount,
        totalCount: entries.length,
    };
}

/**
 * Calculate statistics for heatmap color mapping
 */
function calculateStats(amounts: number[]) {
    if (amounts.length === 0) {
        return {
            minAmount: 0,
            maxAmount: 0,
            avgAmount: 0,
            p80Amount: 0,
        };
    }

    const sorted = [...amounts].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // Calculate 80th percentile
    const p80Index = Math.floor(sorted.length * 0.8);
    const p80 = sorted[p80Index] || max;

    return {
        minAmount: min,
        maxAmount: max,
        avgAmount: avg,
        p80Amount: p80,
    };
}
