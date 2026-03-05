/**
 * Ledger Management Mutations Hook
 *
 * Manages all ledger mutation operations: create, delete, rename, set primary.
 */

import { useRouter } from "@/i18n/routing";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
    deleteLedgerAction,
    setDefaultLedgerAction,
    createLedgerAction,
    updateLedgerAction,
} from "@/features/ledger/server/actions/ledgers";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations";
import type { Ledger } from "@/types/api";

interface UseLedgerMutationsOptions {
    ledgerId: string;
    allLedgers: Ledger[];
    defaultLedgerId: string | null;
    onCreateSuccess?: () => void;
}

interface UseLedgerMutationsResult {
    deleteMutation: ReturnType<typeof useLedgerMutation>;
    setPrimaryMutation: ReturnType<typeof useLedgerMutation>;
    createMutation: ReturnType<typeof useLedgerMutation>;
    renameMutation: ReturnType<typeof useLedgerMutation>;
    handleDeleteWithNavigation: (target: Ledger) => void;
}

export function useLedgerMutations({
    ledgerId,
    allLedgers,
    defaultLedgerId,
    onCreateSuccess,
}: UseLedgerMutationsOptions): UseLedgerMutationsResult {
    const t = useTranslations("Settings");
    const tLedgerSwitcher = useTranslations("LedgerSwitcher");
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

    // Set as primary mutation
    const setPrimaryMutation = useLedgerMutation(ledgerId, {
        mutationFn: (id: string) => setDefaultLedgerAction(id),
        successMessage: t("primaryLedgerSet"),
        errorMessage: t("setPrimaryFailed"),
        onSuccessExtra: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.defaultLedgerId() });
        },
    });

    // Create ledger mutation
    const createMutation = useLedgerMutation(ledgerId, {
        mutationFn: (name: string) => createLedgerAction({ name }),
        successMessage: tLedgerSwitcher("createSuccess"),
        errorMessage: tLedgerSwitcher("createFailed"),
        onSuccessExtra: (newLedger) => {
            onCreateSuccess?.();
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgers() });
            router.push(`/ledger/${newLedger.id}`);
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
        // If deleting current ledger, navigate to primary ledger or first ledger
        if (deleteTarget.id === ledgerId) {
            const targetId = defaultLedgerId && defaultLedgerId !== deleteTarget.id
                ? defaultLedgerId
                : allLedgers.find(l => l.id !== deleteTarget.id)?.id;

            deleteMutation.mutate(deleteTarget.id);
            if (targetId) {
                router.push(`/ledger/${targetId}`);
            } else {
                router.push("/");
            }
        } else {
            deleteMutation.mutate(deleteTarget.id);
        }
    };

    return {
        deleteMutation,
        setPrimaryMutation,
        createMutation,
        renameMutation,
        handleDeleteWithNavigation,
    };
}
