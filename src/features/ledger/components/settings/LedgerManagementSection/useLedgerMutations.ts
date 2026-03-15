/**
 * Ledger Management Mutations Hook
 *
 * Manages ledger mutation operations: delete, rename.
 * Note: With single ledger limit, create and setPrimary are no longer needed.
 */

import { useRouter } from "@/i18n/routing";
import { useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateLedgerAction } from "@/features/ledger/server/actions/update";
import { deleteLedgerAction } from "@/features/ledger/server/actions/delete";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations";
import type { Ledger } from "@/types/api";

interface UseLedgerMutationsOptions {
    ledgerId: string;
    allLedgers: Ledger[];
    defaultLedgerId: string | null;
}

// Database Ledger type returned by updateLedgerAction (with Date objects)
type DbLedger = import("@/lib/db/schema").Ledger;

interface UseLedgerMutationsResult {
    deleteMutation: UseMutationResult<void, Error, string, unknown>;
    renameMutation: UseMutationResult<DbLedger, Error, { id: string; name: string }, unknown>;
    handleDeleteWithNavigation: (target: Ledger) => void;
}

export function useLedgerMutations({
    ledgerId,
    allLedgers,
    defaultLedgerId,
}: UseLedgerMutationsOptions): UseLedgerMutationsResult {
    const t = useTranslations("Settings");
    const router = useRouter();
    const queryClient = useQueryClient();

    // Delete mutation
    const deleteMutation = useLedgerMutation(ledgerId, {
        mutationFn: (id: string) => deleteLedgerAction(id),
        successMessage: t("ledgerDeleted"),
        errorMessage: t("deleteLedgerFailed"),
        onSuccessExtra: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgers() });
            queryClient.invalidateQueries({ queryKey: queryKeys.defaultLedgerId() });
        },
        onErrorExtra: (error) => {
            toast.error(error.message);
        },
    });

    // Rename ledger mutation
    const renameMutation = useLedgerMutation(ledgerId, {
        mutationFn: ({ id, name }: { id: string; name: string }) => updateLedgerAction(id, { name }),
        onSuccessExtra: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgers() });
        },
    });

    const handleDeleteWithNavigation = (deleteTarget: Ledger) => {
        // With single ledger limit, deleting the only ledger navigates to home
        if (deleteTarget.id === ledgerId) {
            deleteMutation.mutate(deleteTarget.id);
            router.push("/");
        } else {
            deleteMutation.mutate(deleteTarget.id);
        }
    };

    return {
        deleteMutation,
        renameMutation,
        handleDeleteWithNavigation,
    };
}
