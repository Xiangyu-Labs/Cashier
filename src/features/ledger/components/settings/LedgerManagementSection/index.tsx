"use client";

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

    const { renameMutation } = useLedgerMutations({
        ledgerId,
        allLedgers,
        defaultLedgerId: ledgerId, // Single ledger is always the primary
    });

    // With single ledger limit, there's only one ledger
    const ledger = allLedgers[0];

    if (!ledger) {
        return (
            <div className="text-sm text-[var(--text-secondary)]">
                {t("noLedgerAvailable")}
            </div>
        );
    }

    return (
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
            </div>
        </div>
    );
}

export { useLedgerMutations } from "./useLedgerMutations";
