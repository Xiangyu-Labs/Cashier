"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { createQuickEntryAction } from "@/features/source-document/server/actions/main";
import { cn } from "@/lib/utils";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { Send } from "lucide-react";
import { type EntryCategory } from "@/types/api";
import { DateFilter } from "@/components/ui/date-filter";

interface QuickEntryFormProps {
    ledgerId: string;
    categories: EntryCategory[];
    onSuccess?: () => void;
}

export function QuickEntryForm({ ledgerId, categories, onSuccess }: QuickEntryFormProps) {
    const t = useTranslations("QuickEntryForm");
    const tCommon = useTranslations("Common");
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [amount, setAmount] = useState(0);
    const [itemName, setItemName] = useState("");
    const [entryDate, setEntryDate] = useState<Date>(new Date());

    const mutation = useLedgerMutation(ledgerId, {
        mutationFn: (data: { categoryId: string; amount: number; itemName?: string; entryDate: string }) =>
            createQuickEntryAction(ledgerId, data),
        successMessage: t("quickEntrySuccess"),
        errorMessage: t("quickEntryError"),
        onSuccessExtra: () => {
            setSelectedCategoryId(null);
            setAmount(0);
            setItemName("");
            setEntryDate(new Date());
            onSuccess?.();
        },
    });

    const handleSubmit = () => {
        if (!selectedCategoryId || amount <= 0) return;
        mutation.mutate({
            categoryId: selectedCategoryId,
            amount,
            itemName: itemName || undefined,
            entryDate: formatDateTimeForApi(entryDate),
        });
    };

    const selectedCategory = categories.find(c => c.id === selectedCategoryId);

    return (
        <div className="space-y-4">
            {/* Category Grid */}
            <div>
                <p className="text-sm text-muted-foreground mb-2">{t("selectCategory")}</p>
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className={cn(
                                "flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors",
                                selectedCategoryId === cat.id
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border hover:bg-accent/10 text-text"
                            )}
                        >
                            <CategoryIcon iconName={cat.icon} className="h-5 w-5" />
                            <span className="text-xs truncate w-full text-center">{cat.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Date Selector */}
            <div>
                <p className="text-sm text-muted-foreground mb-2">{t("selectDate")}</p>
                <DateFilter
                    value={entryDate}
                    onChange={(date) => setEntryDate(date || new Date())}
                    placeholder={t("selectDate")}
                    size="sm"
                    className="w-full"
                />
            </div>

            {/* Amount */}
            <div className="flex items-center justify-center py-2">
                <CalculatorInput
                    value={amount}
                    onChange={setAmount}
                    displayClassName="text-3xl font-bold font-mono text-center"
                />
            </div>

            {/* Item Name (optional) */}
            <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={selectedCategory ? `${t("itemNamePlaceholder")}${selectedCategory.name}` : t("itemName")}
                className="text-sm"
            />

            {/* Submit */}
            <Button
                onClick={handleSubmit}
                disabled={!selectedCategoryId || amount <= 0 || mutation.isPending}
                className="w-full"
            >
                {mutation.isPending ? tCommon("sending_status") : (
                    <>
                        <Send className="h-4 w-4 mr-2" />
                        {t("record")}
                    </>
                )}
            </Button>
        </div>
    );
}
