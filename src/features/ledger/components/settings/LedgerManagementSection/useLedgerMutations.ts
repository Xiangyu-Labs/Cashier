/**
 * Ledger Management Mutations Hook
 *
 * Manages ledger mutation operations: rename only.
 * Note: With single ledger limit, create, delete, and setPrimary are no longer needed.
 */

import { useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { updateLedgerAction } from "@/features/ledger/server/actions/update";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations";
import type { Ledger } from "@/types/api";

interface UseLedgerMutationsOptions {
    ledgerId: string;
    allLedgers: Ledger[];
    defaultLedgerId: string | null;
}

interface UseLedgerMutationsResult {
    renameMutation: UseMutationResult<Ledger, Error, { id: string; name: string }, unknown>;
}

export function useLedgerMutations({
    ledgerId,
}: UseLedgerMutationsOptions): UseLedgerMutationsResult {
    const queryClient = useQueryClient();

    // Rename ledger mutation
    const renameMutation = useLedgerMutation(ledgerId, {
        mutationFn: ({ id, name }: { id: string; name: string }) => updateLedgerAction(id, { name }),
        onSuccessExtra: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgers() });
        },
    });

    return {
        renameMutation,
    };
}
