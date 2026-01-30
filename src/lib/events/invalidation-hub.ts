import { QueryClient } from "@tanstack/react-query";
import { LedgerEvent } from "./types";
import { queryKeys } from "@/lib/query-keys";
import { SourceDocument } from "@/types/api";

/**
 * Handles incoming ledger events and invalidates relevant queries
 */
export function handleEvent(queryClient: QueryClient, event: LedgerEvent) {
    if (event.type !== 'entity:changed') return;

    const { ledgerId, entity, action, ids } = event;

    // Special handling for source_document optimistic updates to prevent flicker
    // When retrying a document, we want to update the cache directly instead of invalidating
    // to avoid the UI flashing between the optimistic state and the refetched state.
    if (entity === 'source_document' && action === 'updated' && event.metadata?.status) {
        const newStatus = event.metadata.status as SourceDocument['status'];
        const activeKey = queryKeys.sourceDocuments(ledgerId, 'active');

        queryClient.setQueryData<SourceDocument[]>(activeKey, (old) => {
            if (!old) return old;

            // If completed, remove from active list as it will move to infinite query
            if (newStatus === 'completed') {
                return old.filter(doc => !ids.includes(doc.id));
            }

            // Otherwise update status in place (e.g. anomaly -> processing)
            return old.map(doc => {
                if (ids.includes(doc.id)) {
                    return { ...doc, status: newStatus };
                }
                return doc;
            });
        });

        // If not completed (e.g. processing/anomaly), we've handled the UI update via cache.
        // Skip standard invalidation to prevent refetch flicker.
        // If completed, we continue to invalidation so other lists (ledger entries, completed docs) update.
        if (newStatus !== 'completed') {
            return;
        }
    }



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

