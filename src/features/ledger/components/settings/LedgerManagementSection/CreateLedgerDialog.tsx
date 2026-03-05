/**
 * Create Ledger Dialog
 *
 * Dialog for creating a new ledger with name input.
 */

"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface CreateLedgerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (name: string) => void;
    isPending: boolean;
}

export function CreateLedgerDialog({
    open,
    onOpenChange,
    onCreate,
    isPending,
}: CreateLedgerDialogProps) {
    const tLedgerSwitcher = useTranslations("LedgerSwitcher");
    const tCommon = useTranslations("Common");
    const [newLedgerName, setNewLedgerName] = useState("");

    const handleCreate = () => {
        if (!newLedgerName.trim()) return;
        onCreate(newLedgerName.trim());
    };

    const handleClose = () => {
        onOpenChange(false);
        setNewLedgerName("");
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent aria-describedby={undefined}>
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
                    <Button variant="secondary" onClick={handleClose}>
                        {tCommon("cancel")}
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!newLedgerName.trim() || isPending}
                    >
                        {isPending ? (
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
    );
}
