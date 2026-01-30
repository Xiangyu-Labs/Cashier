import { QueryClient } from "@tanstack/react-query";
import { LedgerEvent } from "./types";
import { queryKeys } from "@/lib/query-keys";

/**
 * Handles incoming ledger events and invalidates relevant queries
 */
export function handleEvent(queryClient: QueryClient, event: LedgerEvent) {
    if (event.type !== 'entity:changed') return;

    const { ledgerId, entity } = event;

    console.log('[SSE Invalidation] Handling event:', event);

    // Define invalidation rules using centralized queryKeys
    // Map entity types to query keys that should be invalidated
    const invalidationMap: Record<string, readonly (readonly unknown[])[]> = {
        ledger_entry: [
            queryKeys.ledgerEntries(ledgerId),
            queryKeys.summary(ledgerId),
            queryKeys.ledger(ledgerId),
        ],
        source_document: [
            queryKeys.sourceDocuments(ledgerId),
            queryKeys.ledgerEntries(ledgerId),
        ],
        task_run: [
            queryKeys.processingTasks(ledgerId),
            queryKeys.tokenStats(ledgerId),
            queryKeys.sourceDocuments(ledgerId),
        ],
        category: [
            queryKeys.entryCategories(ledgerId),
            queryKeys.ledgerEntries(ledgerId),
        ],
        ledger: [
            queryKeys.ledger(ledgerId),
        ],
        service_credential: [
            queryKeys.serviceCredentials(ledgerId),
        ]
    };

    const keysToInvalidate = invalidationMap[entity];

    if (keysToInvalidate) {
        // Invalidate all mapped keys
        keysToInvalidate.forEach(queryKey => {
            queryClient.invalidateQueries({ queryKey: queryKey as string[] });
        });
    }
}

