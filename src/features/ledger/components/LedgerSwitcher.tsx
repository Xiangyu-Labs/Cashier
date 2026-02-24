"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Check, ChevronsUpDown, Plus, Book } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createLedgerAction } from "@/features/ledger/server/actions/ledgers"; // Use Server Action
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Ledger } from "@/types/api";

interface LedgerSwitcherProps {
    currentLedgerId: string;
    currentLedgerName?: string;
    ledgers?: Ledger[]; // Accept ledgers as prop
}

export function LedgerSwitcher({ currentLedgerId, currentLedgerName, ledgers = [] }: LedgerSwitcherProps) {
    const t = useTranslations("LedgerSwitcher");
    const tCommon = useTranslations("Common");
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [open, setOpen] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newLedgerName, setNewLedgerName] = useState("");

    // Use passed ledgers or empty array
    const currentLedger = ledgers?.find((l) => l.id === currentLedgerId);

    async function handleCreate() {
        if (!newLedgerName.trim()) return;

        startTransition(async () => {
            try {
                const newLedger = await createLedgerAction({
                    name: newLedgerName.trim()
                });

                setShowCreateModal(false);
                setNewLedgerName("");
                setOpen(false);
                toast.success(t("createSuccess"), {
                    description: t("createSuccessDesc"),
                });
                router.push(`/ledger/${newLedger.id}`);
            } catch (error) {
                toast.error(t("createFailed"), {
                    description: error instanceof Error ? error.message : t("createFailedDesc"),
                });
            }
        });
    }

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={open}
                        className="w-auto px-2 hover:bg-transparent text-lg font-bold hover:text-primary transition-colors hover:bg-accent/10"
                    >
                        <span className="truncate text-left max-w-[100px] sm:max-w-[150px]">{currentLedger?.name || currentLedgerName || t("selectLedger")}</span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[200px] p-0" align="start">
                    <div className="max-h-[300px] overflow-y-auto p-1">
                        {ledgers?.map((ledger) => (
                            <div
                                key={ledger.id}
                                className={cn(
                                    "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors",
                                    currentLedgerId === ledger.id && "bg-accent/50"
                                )}
                                onClick={() => {
                                    setOpen(false);
                                    router.push(`/ledger/${ledger.id}`);
                                }}
                            >
                                <Book className="h-4 w-4 text-muted-foreground" />
                                <span className="flex-1 truncate">{ledger.name}</span>
                                <span className="w-4">
                                    {currentLedgerId === ledger.id && (
                                        <Check className="h-4 w-4 text-primary" />
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-border p-1">
                        <div
                            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground text-primary transition-colors"
                            onClick={() => setShowCreateModal(true)}
                        >
                            <Plus className="h-4 w-4" />
                            <span>{t("newLedger")}</span>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{t("newLedger")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text">
                                {t("ledgerName")}
                            </label>
                            <Input
                                value={newLedgerName}
                                onChange={(e) => setNewLedgerName(e.target.value)}
                                placeholder={t("placeholder")}
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
                            disabled={!newLedgerName.trim() || isPending}
                        >
                            {isPending ? t("creating") : t("create")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

