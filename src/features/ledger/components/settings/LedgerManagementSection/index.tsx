"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getDefaultLedgerIdAction } from "@/features/ledger/server/actions/ledgers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Star, Plus, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Ledger } from "@/types/api";
import { cn } from "@/lib/utils";
import { EditableField } from "@/components/ui/editable-field";
import { useLedgerMutations } from "./useLedgerMutations";
import { CreateLedgerDialog } from "./CreateLedgerDialog";

interface LedgerManagementSectionProps {
    ledgerId: string;
    allLedgers: Ledger[];
}

export function LedgerManagementSection({ ledgerId, allLedgers }: LedgerManagementSectionProps) {
    const t = useTranslations("Settings");
    const tCommon = useTranslations("Common");
    const router = useRouter();
    const [isPending] = useTransition();

    // Get default ledger ID
    const { data: defaultLedgerId } = useQuery({
        queryKey: queryKeys.defaultLedgerId(),
        queryFn: () => getDefaultLedgerIdAction(),
        staleTime: 10 * 60 * 1000,
    });

    // State for dialogs
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Ledger | null>(null);

    const {
        deleteMutation,
        setPrimaryMutation,
        createMutation,
        renameMutation,
        handleDeleteWithNavigation,
    } = useLedgerMutations({
        ledgerId,
        allLedgers,
        defaultLedgerId: defaultLedgerId ?? null,
        onCreateSuccess: () => setShowCreateModal(false),
    });

    const handleDelete = (ledger: Ledger) => {
        const isOnlyLedger = allLedgers.length <= 1;
        const isPrimary = defaultLedgerId === ledger.id;

        if (isOnlyLedger) {
            toast.error(t("cannotDeleteLastLedger"));
            return;
        }

        if (isPrimary) {
            toast.error(t("cannotDeletePrimaryLedger"));
            return;
        }

        setDeleteTarget(ledger);
    };

    const confirmDelete = () => {
        if (!deleteTarget) return;
        handleDeleteWithNavigation(deleteTarget);
        setDeleteTarget(null);
    };

    const handleSwitch = (targetId: string) => {
        router.push(`/ledger/${targetId}`);
    };

    const handleSetPrimary = (targetId: string) => {
        setPrimaryMutation.mutate(targetId);
    };

    const isOnlyLedger = allLedgers.length <= 1;

    return (
        <>
            <div className="space-y-2">
                {allLedgers.map((ledger) => {
                    const isCurrent = ledger.id === ledgerId;
                    const isPrimary = defaultLedgerId === ledger.id;
                    const canDelete = !isOnlyLedger && !isPrimary;

                    return (
                        <div
                            key={ledger.id}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-lg transition-colors",
                                isCurrent ? "bg-[var(--surface2)]" : "hover:bg-[var(--surface2)]/50"
                            )}
                        >
                            {/* Ledger name and badges */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <EditableField
                                        value={ledger.name}
                                        onChange={(newName) => {
                                            if (newName.trim() && newName.trim() !== ledger.name) {
                                                renameMutation.mutate({ id: ledger.id, name: newName.trim() });
                                            }
                                        }}
                                        displayClassName="font-medium truncate"
                                    />
                                    {isPrimary && (
                                        <Badge variant="success" className="gap-1 text-xs shrink-0">
                                            <Star className="h-3 w-3 fill-current" />
                                            {t("primaryLedger")}
                                        </Badge>
                                    )}
                                    {isCurrent && !isPrimary && (
                                        <Badge variant="outline" className="text-xs shrink-0">
                                            {t("currentLedger")}
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 shrink-0">
                                {!isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSwitch(ledger.id)}
                                        disabled={isPending}
                                        className="h-8 px-2"
                                    >
                                        <ArrowRight className="h-4 w-4 mr-1" />
                                        {t("switchTo")}
                                    </Button>
                                )}

                                {!isPrimary && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSetPrimary(ledger.id)}
                                        disabled={isPending || setPrimaryMutation.isPending}
                                        className="h-8 px-2"
                                    >
                                        <Star className="h-4 w-4 mr-1" />
                                        {t("setAsPrimary")}
                                    </Button>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(ledger)}
                                    disabled={isPending || !canDelete || deleteMutation.isPending}
                                    className={cn(
                                        "h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10",
                                        !canDelete && "cursor-not-allowed opacity-50"
                                    )}
                                    title={
                                        isOnlyLedger
                                            ? t("cannotDeleteLastLedger")
                                            : isPrimary
                                                ? t("cannotDeletePrimaryLedger")
                                                : undefined
                                    }
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Create new ledger button */}
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <Button
                    variant="outline"
                    onClick={() => setShowCreateModal(true)}
                    disabled={isPending || createMutation.isPending}
                    className="w-full"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("createLedger")}
                </Button>
            </div>

            {/* Create Ledger Dialog */}
            <CreateLedgerDialog
                open={showCreateModal}
                onOpenChange={setShowCreateModal}
                onCreate={(name) => createMutation.mutate(name)}
                isPending={createMutation.isPending}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteLedgerConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("deleteLedgerConfirmDesc", { name: deleteTarget?.name || "" })}
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
export { CreateLedgerDialog } from "./CreateLedgerDialog";
