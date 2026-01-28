import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntryCategory } from "@/types/api";
import { type ReactNode } from "react";
import { useTranslations } from "next-intl";

export interface LedgerEntryEditFormData {
    itemName: string;
    amount: number;
    currency: string;
    categoryId: string;
    entryDate: string;
}

interface LedgerEntryEditFormProps {
    data: LedgerEntryEditFormData;
    categories: EntryCategory[];
    onChange: (data: LedgerEntryEditFormData) => void;
    onSave: () => void;
    onCancel: () => void;
}

export function LedgerEntryEditForm({
    data,
    categories,
    onChange,
    onSave,
    onCancel,
}: LedgerEntryEditFormProps): ReactNode {
    const t = useTranslations("LedgerEntryDetail");
    const tCommon = useTranslations("Common");

    const handleChange = <K extends keyof LedgerEntryEditFormData>(
        field: K,
        value: LedgerEntryEditFormData[K]
    ) => {
        onChange({ ...data, [field]: value });
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-text">{t("itemName")}</label>
                <Input
                    type="text"
                    value={data.itemName}
                    onChange={(e) => handleChange("itemName", e.target.value)}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text">{t("amount")}</label>
                    <Input
                        type="number"
                        value={data.amount}
                        onChange={(e) =>
                            handleChange("amount", parseFloat(e.target.value) || 0)
                        }
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text">{t("currency")}</label>
                    <Input
                        type="text"
                        value={data.currency}
                        onChange={(e) => handleChange("currency", e.target.value)}
                        placeholder="CNY / USD"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-text">{t("category")}</label>
                <select
                    value={data.categoryId}
                    onChange={(e) => handleChange("categoryId", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    <option value="">{t("selectCategory")}</option>
                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-text">{t("entryDate")}</label>
                <Input
                    type="date"
                    value={data.entryDate}
                    onChange={(e) => handleChange("entryDate", e.target.value)}
                />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={onCancel}>
                    {tCommon("cancel")}
                </Button>
                <Button onClick={onSave}>{tCommon("save")}</Button>
            </div>
        </div>
    );
}
