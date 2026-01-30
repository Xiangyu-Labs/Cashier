import { QueryClient } from "@tanstack/react-query";
import { LedgerEvent } from "./types";

/**
 * Handles incoming ledger events and invalidates relevant queries
 */
export function handleEvent(queryClient: QueryClient, event: LedgerEvent) {
    if (event.type !== 'entity:changed') return;

    const { ledgerId, entity } = event;

    // Define invalidation rules
    // Map entity types to query keys that should be invalidated
    const invalidationMap: Record<string, string[][]> = {
        ledger_entry: [
            ['ledger-entries', ledgerId], // Main list
            ['ledger-summary', ledgerId], // Summary/Stats
            ['ledger', ledgerId], // Ledger details (maybe last updated time)
        ],
        source_document: [
            ['source-documents', ledgerId], // Document list
            ['ledger-entries', ledgerId],  // Entries might change if doc status changes
            ['processing-tasks', ledgerId], // Tasks often relate to docs
        ],
        task_run: [
            ['processing-tasks', ledgerId], // Active tasks list
            ['processing-stats', ledgerId], // Token usage stats
            ['source-documents', ledgerId], // Documents status might be affected by task
        ],
        category: [
            ['entry-categories', ledgerId],
            ['ledger-entries', ledgerId], // Entries verify category names
        ],
        ledger: [
            ['ledger', ledgerId],
            ['service-credentials', ledgerId],
        ],
        service_credential: [
            ['service-credentials', ledgerId],
        ]
    };

    const keysToInvalidate = invalidationMap[entity];

    if (keysToInvalidate) {
        // Invalidate all mapped keys
        keysToInvalidate.forEach(queryKey => {
            queryClient.invalidateQueries({ queryKey });
        });
    }

    // Special handling for specific actions if needed
    // e.g. if action is 'deleted', maybe remove from cache manually?
    // For now, invalidation is sufficient and safer.
}
