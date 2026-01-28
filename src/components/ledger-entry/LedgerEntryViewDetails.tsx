
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LedgerEntry, EntryCategory } from "@/types/api";
import { Calendar, Edit2, Tag, Trash2, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { type ReactNode, useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface LedgerEntryEditFormData {
    itemName: string;
    amount: number;
    currency: string;
    categoryId: string;
    entryDate: string;
    description: string;
}

interface LedgerEntryViewDetailsProps {
    ledgerEntry: LedgerEntry;
    isEditing: boolean;
    editData: LedgerEntryEditFormData;
    categories: EntryCategory[];
    onEditStart: () => void;
    onEditChange: (data: LedgerEntryEditFormData) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onDelete: () => void;
}

export function LedgerEntryViewDetails({
    ledgerEntry,
    isEditing,
    editData,
    categories,
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    onDelete,
}: LedgerEntryViewDetailsProps): ReactNode {
    const t = useTranslations("LedgerEntryDetail");
    const tCommon = useTranslations("Common");
    const locale = useLocale();

    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [needsFolding, setNeedsFolding] = useState(false);
    const descriptionRef = useRef<HTMLDivElement>(null);

    // Effect to check if description needs folding (exceeds 3 lines)
    useEffect(() => {
        if (!isEditing && ledgerEntry.description && descriptionRef.current) {
            const element = descriptionRef.current;
            // Temporarily remove line-clamp to measure full height
            const isClamped = element.classList.contains("line-clamp-3");
            if (isClamped) element.classList.remove("line-clamp-3");

            const fullHeight = element.scrollHeight;

            // Re-apply line-clamp to measure clamped height
            element.classList.add("line-clamp-3");
            const clampedHeight = element.clientHeight;

            // If full height is greater than clamped height, it needs folding
            setNeedsFolding(fullHeight > clampedHeight);

            // Restore state based on isDescriptionExpanded
            if (isDescriptionExpanded) {
                element.classList.remove("line-clamp-3");
            }
        }
    }, [ledgerEntry.description, isEditing, isDescriptionExpanded]);

    // Format dates for display
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return t("unknown");
        return new Date(dateStr).toLocaleDateString(locale);
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString(locale);
    };

    const handleFieldChange = <K extends keyof LedgerEntryEditFormData>(
        field: K,
        value: LedgerEntryEditFormData[K]
    ) => {
        onEditChange({ ...editData, [field]: value });
    };

    return (
        <div className="space-y-6">
            {/* Header Info */}
            <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-surface2 flex items-center justify-center text-3xl shadow-sm border border-border shrink-0">
                    <CategoryIcon
                        iconName={
                            isEditing
                                ? categories.find(c => c.id === editData.categoryId)?.icon || "help-circle"
                                : ledgerEntry.category?.icon
                        }
                        className="h-8 w-8"
                    />
                </div>
                <div className="flex-1 space-y-2">
                    {isEditing ? (
                        <>
                            <Input
                                value={editData.itemName}
                                onChange={(e) => handleFieldChange("itemName", e.target.value)}
                                className="font-semibold text-lg"
                                placeholder={t("itemName")}
                            />
                            <div className="flex gap-2 items-end">
                                <div className="w-24">
                                    <Input
                                        value={editData.currency}
                                        onChange={(e) => handleFieldChange("currency", e.target.value)}
                                        placeholder="CNY"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="flex-1">
                                    <Input
                                        type="number"
                                        value={editData.amount}
                                        onChange={(e) => handleFieldChange("amount", parseFloat(e.target.value) || 0)}
                                        className="text-xl font-bold font-mono"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <h3 className="text-xl font-semibold text-text break-words">
                                {ledgerEntry.itemName}
                            </h3>
                            <p className="text-3xl font-bold text-primary mt-1">
                                <span className="text-lg font-normal text-muted mr-1">
                                    {ledgerEntry.currency || "?"}
                                </span>
                                {parseFloat(ledgerEntry.amount).toFixed(2)}
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface2/30 p-4">
                <div className="flex justify-between items-center h-10">
                    {/* Date on the left */}
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted" />
                        {isEditing ? (
                            <Input
                                type="date"
                                value={editData.entryDate}
                                onChange={(e) => handleFieldChange("entryDate", e.target.value)}
                                className="w-[140px] h-8 text-xs"
                            />
                        ) : (
                            <span className="text-sm text-text">
                                {formatDate(ledgerEntry.entryDate)}
                            </span>
                        )}
                    </div>

                    {/* Category on the right */}
                    <div className="flex items-center gap-2">
                        {isEditing ? (
                            <select
                                value={editData.categoryId}
                                onChange={(e) => handleFieldChange("categoryId", e.target.value)}
                                className="h-8 rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-w-[120px]"
                            >
                                <option value="">{t("selectCategory")}</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.icon} {cat.name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            ledgerEntry.category ? (
                                <Badge variant="default" className="font-normal bg-primary/10 text-primary hover:bg-primary/20 border-none transition-colors">
                                    <CategoryIcon iconName={ledgerEntry.category.icon} className="h-3 w-3 mr-1.5" />
                                    {ledgerEntry.category.name}
                                </Badge>
                            ) : null
                        )}
                    </div>
                </div>

                {/* Description / Remark */}
                <div className="border-t border-border/50 pt-4 mt-2">
                    {/* Label removed as per design request */}

                    {isEditing ? (
                        <Textarea
                            value={editData.description}
                            onChange={(e) => handleFieldChange("description", e.target.value)}
                            className="min-h-[100px] text-sm"
                            placeholder={t("description")}
                        />
                    ) : (
                        ledgerEntry.description ? (
                            <div className="text-sm text-text">
                                <div
                                    ref={descriptionRef}
                                    className={`break-words whitespace-pre-wrap ${!isDescriptionExpanded ? "line-clamp-3" : ""}`}
                                >
                                    {ledgerEntry.description}
                                </div>
                                {needsFolding && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        className="h-6 px-0 text-primary hover:text-primary/80 mt-1"
                                    >
                                        {isDescriptionExpanded ? (
                                            <>{t("collapse")} <ChevronUp className="h-3 w-3 ml-1" /></>
                                        ) : (
                                            <>{t("expand")} <ChevronDown className="h-3 w-3 ml-1" /></>
                                        )}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <span className="text-sm text-muted italic">{t("noDescription")}</span>
                        )
                    )}
                </div>

                <div className="flex justify-between items-center border-t border-border/50 pt-4">
                    <span className="text-sm text-muted">{t("createdAt")}</span>
                    <span className="text-sm text-text">
                        {formatDateTime(ledgerEntry.createdAt)}
                    </span>
                </div>
            </div>

            {/* Original Input removed */}

            {/* Actions Bottom */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                {isEditing ? (
                    <>
                        <Button
                            variant="ghost"
                            onClick={onEditCancel}
                            className="h-10 px-4"
                        >
                            <X className="h-4 w-4 mr-2" />
                            {tCommon("cancel")}
                        </Button>
                        <Button
                            onClick={onEditSave}
                            className="h-10 px-6"
                        >
                            <Check className="h-4 w-4 mr-2" />
                            {tCommon("save")}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            variant="destructive"
                            onClick={onDelete}
                            className="h-10 px-6"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {tCommon("delete")}
                        </Button>
                        <Button
                            onClick={onEditStart}
                            className="h-10 px-6"
                        >
                            <Edit2 className="h-4 w-4 mr-2" />
                            {t("edit")}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
