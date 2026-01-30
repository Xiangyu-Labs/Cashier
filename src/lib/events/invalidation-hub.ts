import { QueryClient } from "@tanstack/react-query";
import { LedgerEvent } from "./types";

/**
 * Handles incoming ledger events and invalidates relevant queries
 */
export function handleEvent(queryClient: QueryClient, event: LedgerEvent) {
    if (event.type !== 'entity:changed') return;

    const { ledgerId, entity } = event;

    console.log('[SSE Invalidation] Handling event:', event);

    // Define invalidation rules
    // Map entity types to query keys that should be invalidated
    // IMPORTANT: Keys must match exactly what's used in useLedgerData.ts and other hooks
    const invalidationMap: Record<string, string[][]> = {
        ledger_entry: [
            ['ledgerEntries', ledgerId],  // Matches useLedgerData: ["ledgerEntries", ledgerId, ...]
            ['summary', ledgerId],        // Matches useLedgerData: ["summary", ledgerId]
            ['ledger', ledgerId],         // Ledger details
        ],
        source_document: [
            ['sourceDocuments', ledgerId],  // Matches useLedgerData: ["sourceDocuments", ledgerId, ...]
            ['ledgerEntries', ledgerId],    // Entries might change if doc status changes
        ],
        task_run: [
            ['processingTasks', ledgerId],  // If this key exists
            ['sourceDocuments', ledgerId],  // Documents status might be affected by task
        ],
        category: [
            ['entryCategories', ledgerId],  // Matches useLedgerData: ["entryCategories", ledgerId]
            ['ledgerEntries', ledgerId],
        ],
        ledger: [
            ['ledger', ledgerId],
        ],
        service_credential: [
            ['serviceCredentials', ledgerId],
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
