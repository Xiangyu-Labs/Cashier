"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Ledger } from "@/types/api";
import { cn } from "@/lib/utils";
import { EditableField } from "@/components/ui/editable-field";
import { useLedgerMutations } from "./useLedgerMutations";

interface LedgerManagementSectionProps {
    ledgerId: string;
    allLedgers: Ledger[];
}

export function LedgerManagementSection({ ledgerId, allLedgers }: LedgerManagementSectionProps) {
    const t = useTranslations("Settings");
    const tCommon = useTranslations("Common");
    const router = useRouter();
    const [isPending] = useTransition();

    // State for delete dialog
    const [deleteTarget, setDeleteTarget] = useState<Ledger | null>(null);

    const {
        deleteMutation,
        renameMutation,
        handleDeleteWithNavigation,
    } = useLedgerMutations({
        ledgerId,
        allLedgers,
        defaultLedgerId: ledgerId, // Single ledger is always the primary
    });

    // With single ledger limit, there's only one ledger
    const ledger = allLedgers[0];

    const handleDelete = () => {
        if (!ledger) return;

        // Single ledger: warn that deletion will require creating a new one
        setDeleteTarget(ledger);
    };

    const confirmDelete = () => {
        if (!deleteTarget) return;
        handleDeleteWithNavigation(deleteTarget);
        setDeleteTarget(null);
    };

    if (!ledger) {
        return (
            <div className="text-sm text-[var(--text-secondary)]">
                {t("noLedgerAvailable")}
            </div>
        );
    }

    return (
        <>
            <div className="space-y-2">
                <div
                    className={cn(
                        "flex items-center gap-3 p-3 rounded-lg transition-colors",
                        "bg-[var(--surface2)]"
                    )}
                >
                    {/* Ledger name - editable */}
                    <div className="flex-1 min-w-0">
                        <EditableField
                            value={ledger.name}
                            onChange={(newName) => {
                                if (newName.trim() && newName.trim() !== ledger.name) {
                                    renameMutation.mutate({ id: ledger.id, name: newName.trim() });
                                }
                            }}
                            displayClassName="font-medium truncate"
                        />
                    </div>

                    {/* Delete button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isPending || deleteMutation.isPending}
                        className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        title={t("deleteLedgerWarning")}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteLedgerConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("deleteSingleLedgerWarning", { name: deleteTarget?.name || "" })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {tCommon("delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export { useLedgerMutations } from "./useLedgerMutations";
