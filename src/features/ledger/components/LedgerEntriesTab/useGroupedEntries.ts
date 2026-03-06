/**
 * Ledger Entries Grouping Hook
 *
 * Groups completed source documents by date for display.
 */

import { useMemo, useCallback } from "react";
import type { SourceDocumentGroup } from "@/lib/serialization";
import type { Ledger } from "@/types/api";

interface DateGroup {
    title: string;
    timestamp: number;
    items: SourceDocumentGroup[];
    total: number;
}

interface UseGroupedEntriesOptions {
    completedGroups: SourceDocumentGroup[];
    locale: string;
    mainCurrency?: string;
    tDetails: (key: string) => string;
}

export function useGroupedEntries({
    completedGroups,
    locale,
    mainCurrency = 'CNY',
    tDetails,
}: UseGroupedEntriesOptions) {
    // Helper to get date string from source document
    const getSourceDocDateStr = useCallback((group: SourceDocumentGroup): string => {
        // Use sourceDocument's entryDate (authoritative source for the document's date)
        if (group.sourceDocument.entryDate) {
            return group.sourceDocument.entryDate;
        }
        // Fallback to sourceDocument createdAt
        const createdAt = group.sourceDocument.createdAt;
        if (createdAt) {
            const date = new Date(createdAt);
            return date.toLocaleDateString('sv'); // Returns YYYY-MM-DD
        }
        return new Date().toLocaleDateString('sv');
    }, []);

    // Group completed documents by date
    const groupedCompletedByDate = useMemo(() => {
        const todayStr = new Date().toLocaleDateString('sv');
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toLocaleDateString('sv');

        const dateGroups: Record<string, DateGroup> = {};

        completedGroups.forEach(group => {
            const dateStr = getSourceDocDateStr(group);
            const [year, month, day] = dateStr.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            const sortTimestamp = date.getTime();

            let dateKey = "";
            if (dateStr === todayStr) {
                dateKey = tDetails("today");
            } else if (dateStr === yesterdayStr) {
                dateKey = tDetails("yesterday");
            } else {
                dateKey = date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" });
            }

            if (!dateGroups[dateKey]) {
                dateGroups[dateKey] = {
                    title: dateKey,
                    timestamp: sortTimestamp,
                    items: [],
                    total: 0
                };
            }

            dateGroups[dateKey].items.push(group);

            // Calculate total for this date using converted amount for foreign currency
            group.ledgerEntries.forEach(entry => {
                const amount = entry.convertedAmount
                    ? parseFloat(entry.convertedAmount)
                    : parseFloat(entry.amount);
                dateGroups[dateKey].total += amount;
            });
        });

        return Object.values(dateGroups).sort((a, b) => b.timestamp - a.timestamp);
    }, [completedGroups, getSourceDocDateStr, locale, tDetails]);

    // Collect all visible source document IDs
    const allSourceDocumentIds = useMemo(() => {
        return groupedCompletedByDate.flatMap(group =>
            group.items.map(item => item.sourceDocument.id)
        );
    }, [groupedCompletedByDate]);

    return {
        groupedCompletedByDate,
        allSourceDocumentIds,
    };
}
