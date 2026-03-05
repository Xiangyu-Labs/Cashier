/**
 * Test script to debug heatmap data fetching
 */

import { db } from '@/lib/db';
import { ledgerEntries } from '@/features/ledger/server/schema';
import { sourceDocuments } from '@/features/source-document/server/schema';
import { and, eq, isNull, between, sql } from 'drizzle-orm';

async function testHeatmapQuery() {
    const ledgerId = 'test-ledger-id';
    const startDate = '2024-01-01';
    const endDate = '2024-12-31';

    console.log('Testing heatmap query...');
    console.log('Date range:', startDate, 'to', endDate);

    try {
        // Check if there are any entries at all
        const allEntries = await db
            .select({
                id: ledgerEntries.id,
                sourceDocId: ledgerEntries.sourceDocumentId,
                amount: ledgerEntries.amount,
            })
            .from(ledgerEntries)
            .where(eq(ledgerEntries.ledgerId, ledgerId))
            .limit(5);

        console.log('Sample ledger entries:', allEntries);

        // Check source documents dates
        const sampleDocs = await db
            .select({
                id: sourceDocuments.id,
                entryDate: sourceDocuments.entryDate,
            })
            .from(sourceDocuments)
            .where(eq(sourceDocuments.ledgerId, ledgerId))
            .limit(5);

        console.log('Sample source documents:', sampleDocs);

        // Test the actual heatmap query
        const conditions = [
            eq(ledgerEntries.ledgerId, ledgerId),
            isNull(ledgerEntries.deletedAt),
            between(sourceDocuments.entryDate, startDate, endDate),
        ];

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

        console.log('Heatmap query results:', results);

    } catch (error) {
        console.error('Query failed:', error);
    }
}

testHeatmapQuery();
