"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations";
import {
    deleteLedgerAction,
    setDefaultLedgerAction,
    createLedgerAction,
    getDefaultLedgerIdAction,
    updateLedgerAction,
} from "@/features/ledger/server/actions/ledgers";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Star, Plus, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Ledger } from "@/types/api";
import { cn } from "@/lib/utils";
import { EditableField } from "@/components/ui/editable-field";

interface LedgerManagementSectionProps {
    ledgerId: string;
    allLedgers: Ledger[];
}

export function LedgerManagementSection({ ledgerId, allLedgers }: LedgerManagementSectionProps) {
    const t = useTranslations("Settings");
    const tCommon = useTranslations("Common");
    const tLedgerSwitcher = useTranslations("LedgerSwitcher");
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isPending, startTransition] = useTransition();

    // Get default ledger ID
    const { data: defaultLedgerId } = useQuery({
        queryKey: queryKeys.defaultLedgerId(),
        queryFn: () => getDefaultLedgerIdAction(),
        staleTime: 10 * 60 * 1000,
    });

    // State for dialogs
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newLedgerName, setNewLedgerName] = useState("");
    const [deleteTarget, setDeleteTarget] = useState<Ledger | null>(null);

    // Delete mutation
    const deleteMutation = useLedgerMutation(ledgerId, {
        mutationFn: (id: string) => deleteLedgerAction(id),
        successMessage: t("ledgerDeleted"),
        errorMessage: t("deleteLedgerFailed"),
        onSuccessExtra: () => {
            setDeleteTarget(null);
            // Invalidate ledgers and defaultLedgerId queries
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgers() });
            queryClient.invalidateQueries({ queryKey: queryKeys.defaultLedgerId() });
        },
        onErrorExtra: (error) => {
            // Show specific error message from server
            toast.error(error.message);
        },
    });

    // Set as primary mutation
    const setPrimaryMutation = useLedgerMutation(ledgerId, {
        mutationFn: (id: string) => setDefaultLedgerAction(id),
        successMessage: t("primaryLedgerSet"),
        errorMessage: t("setPrimaryFailed"),
        onSuccessExtra: () => {
            // Invalidate defaultLedgerId query
            queryClient.invalidateQueries({ queryKey: queryKeys.defaultLedgerId() });
        },
    });

    // Create ledger mutation
    const createMutation = useLedgerMutation(ledgerId, {
        mutationFn: (name: string) => createLedgerAction({ name }),
        successMessage: tLedgerSwitcher("createSuccess"),
        errorMessage: tLedgerSwitcher("createFailed"),
        onSuccessExtra: (newLedger) => {
            setShowCreateModal(false);
            setNewLedgerName("");
            // Invalidate ledgers query
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgers() });
            // Navigate to the new ledger
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

    const handleCreate = () => {
        if (!newLedgerName.trim()) return;
        createMutation.mutate(newLedgerName.trim());
    };

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

        // If deleting current ledger, navigate to primary ledger or first ledger
        if (deleteTarget.id === ledgerId) {
            const targetId = defaultLedgerId && defaultLedgerId !== deleteTarget.id
                ? defaultLedgerId
                : allLedgers.find(l => l.id !== deleteTarget.id)?.id;

            deleteMutation.mutate(deleteTarget.id);
            if (targetId) {
                router.push(`/ledger/${targetId}`);
            } else {
                // Fallback: navigate to home which will redirect
                router.push("/");
            }
        } else {
            deleteMutation.mutate(deleteTarget.id);
        }
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
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tLedgerSwitcher("newLedger")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text">
                                {tLedgerSwitcher("ledgerName")}
                            </label>
                            <Input
                                value={newLedgerName}
                                onChange={(e) => setNewLedgerName(e.target.value)}
                                placeholder={tLedgerSwitcher("placeholder")}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && newLedgerName.trim()) {
                                        handleCreate();
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowCreateModal(false);
                                setNewLedgerName("");
                            }}
                        >
                            {tCommon("cancel")}
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!newLedgerName.trim() || createMutation.isPending}
                        >
                            {createMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {tLedgerSwitcher("creating")}
                                </>
                            ) : (
                                tLedgerSwitcher("create")
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
