"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations";
import {
    batchUpdateSourceDocumentsAction,
    batchDeleteSourceDocumentsAction,
    batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions/main";

export function useBatchSourceDocumentActions(ledgerId: string, clearSelection: () => void) {
    const tCommon = useTranslations("Common");
    const tBatch = useTranslations("BatchActions");

    const batchUpdateDates = useLedgerMutation(ledgerId, {
        mutationFn: async ({ ids, entryDate }: { ids: string[]; entryDate: string }) => {
            await batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate });
        },
        successMessage: "",
        errorMessage: tCommon("error"),
        onSuccessExtra: (_data, { ids }) => {
            toast.success(tBatch("datesUpdated", { count: ids.length }));
            clearSelection();
        },
    });

    const batchDelete = useLedgerMutation(ledgerId, {
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        successMessage: "",
        errorMessage: tCommon("error"),
        onSuccessExtra: (_data, ids) => {
            toast.success(tBatch("entriesDeleted", { count: ids.length }));
            clearSelection();
        },
    });

    const batchRetry = useLedgerMutation(ledgerId, {
        mutationFn: async (ids: string[]) => {
            await batchRetrySourceDocumentsAction(ledgerId, ids);
        },
        successMessage: "",
        errorMessage: tCommon("error"),
        onSuccessExtra: (_data, ids) => {
            toast.success(tBatch("retrySubmitted", { count: ids.length }));
            clearSelection();
        },
    });

    return {
        batchUpdateDates,
        batchDelete,
        batchRetry,
    };
}
