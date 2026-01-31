
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LedgerEntry, EntryCategory } from "@/types/api";
import { Calendar, Edit2, Trash2, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { type ReactNode, useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { useMemo } from "react";

import { useConvertedAmount } from "@/hooks/useConvertedAmount";
import { motion, AnimatePresence } from "framer-motion";

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
    preferredCurrencies?: string[];
    mainCurrency?: string;
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
    preferredCurrencies = [],
    mainCurrency = "CNY",
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    onDelete,
}: LedgerEntryViewDetailsProps): ReactNode {
    const t = useTranslations("LedgerEntryDetail");
    const tCommon = useTranslations("Common");
    const locale = useLocale();

    const { converted } = useConvertedAmount(
        parseFloat(ledgerEntry.amount),
        ledgerEntry.currency,
        mainCurrency,
        ledgerEntry.entryDate || ledgerEntry.createdAt
    );

    const isDifferentCurrency = ledgerEntry.currency && ledgerEntry.currency !== mainCurrency && ledgerEntry.currency !== "unknown";

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

    const sortedCurrencies = useMemo(() => {
        const preferred = preferredCurrencies.filter(c => c !== "unknown");
        const remaining = SUPPORTED_CURRENCIES.filter(c => !preferred.includes(c));
        return [...preferred, ...remaining.sort()];
    }, [preferredCurrencies]);

    const showUnknown = ledgerEntry.sourceDocument?.status === "anomaly";

    return (
        <div className="flex flex-col h-full max-h-[inherit]">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 subtle-scrollbar">
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
                                        <select
                                            value={editData.currency}
                                            onChange={(e) => handleFieldChange("currency", e.target.value)}
                                            className="w-full h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {showUnknown && (
                                                <option value="unknown">unknown</option>
                                            )}
                                            {sortedCurrencies.map(curr => (
                                                <option key={curr} value={curr}>{curr}</option>
                                            ))}
                                        </select>
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
                                <div className="mt-1">
                                    <p className="text-3xl font-bold text-primary">
                                        <span className="text-lg font-normal text-muted-foreground mr-1">
                                            {isDifferentCurrency ? mainCurrency : (ledgerEntry.currency === "unknown" ? "?" : ledgerEntry.currency)}
                                        </span>
                                        {(isDifferentCurrency ? converted : parseFloat(ledgerEntry.amount)).toFixed(2)}
                                    </p>
                                    {isDifferentCurrency && (
                                        <p className="text-sm font-medium text-muted-foreground mt-0.5 opacity-80">
                                            ≈ {ledgerEntry.currency} {parseFloat(ledgerEntry.amount).toFixed(2)}
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface2/30 p-4">
                    <div className="flex justify-between items-center h-10">
                        {/* Date on the left */}
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground mr-1">{t("entryDate")}:</span>
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
                            <span className="text-sm text-muted-foreground mr-1">{t("category")}:</span>
                            {isEditing ? (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className="h-8 w-[140px] justify-between px-2 py-1 text-xs font-normal border-border bg-surface"
                                        >
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                {editData.categoryId ? (
                                                    <>
                                                        <CategoryIcon
                                                            iconName={categories.find(c => c.id === editData.categoryId)?.icon}
                                                            className="h-3 w-3 shrink-0"
                                                        />
                                                        <span className="truncate">
                                                            {categories.find(c => c.id === editData.categoryId)?.name}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground-foreground">{t("selectCategory")}</span>
                                                )}
                                            </div>
                                            <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[180px] p-1" align="end">
                                        <div className="max-h-[200px] overflow-y-auto">
                                            {categories.map((cat) => (
                                                <button
                                                    key={cat.id}
                                                    onClick={() => handleFieldChange("categoryId", cat.id)}
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                                                        editData.categoryId === cat.id ? "bg-accent text-accent-foreground" : "text-text"
                                                    )}
                                                >
                                                    <CategoryIcon iconName={cat.icon} className="h-3.5 w-3.5" />
                                                    <span className="flex-1 truncate">{cat.name}</span>
                                                    {editData.categoryId === cat.id && (
                                                        <Check className="h-3 w-3" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
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
                                    <AnimatePresence initial={false}>
                                        <motion.div
                                            ref={descriptionRef}
                                            initial={false}
                                            animate={{ height: isDescriptionExpanded ? "auto" : "auto" }}
                                            className={`break-words whitespace-pre-wrap ${!isDescriptionExpanded ? "line-clamp-3" : ""}`}
                                        >
                                            {ledgerEntry.description}
                                        </motion.div>
                                    </AnimatePresence>
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
                                <span className="text-sm text-muted-foreground italic">{t("noDescription")}</span>
                            )
                        )}
                    </div>

                    <div className="flex justify-between items-center border-t border-border/50 pt-4">
                        <span className="text-sm text-muted-foreground">{t("createdAt")}</span>
                        <span className="text-sm text-text">
                            {formatDateTime(ledgerEntry.createdAt)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions Footer - Fixed to bottom of modal */}
            <div className="shrink-0 flex justify-end gap-3 p-4 border-t border-border/50 bg-surface/50 backdrop-blur-sm sm:rounded-b-lg">
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
                            className="h-10 px-6 rounded-xl shadow-md shadow-primary/10"
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
                            className="h-10 px-6 rounded-xl text-destructive/80 bg-destructive/5 hover:bg-destructive/10 border-destructive/10 hover:border-destructive/20 transition-all font-medium"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {tCommon("delete")}
                        </Button>
                        <Button
                            onClick={onEditStart}
                            className="h-10 px-6 rounded-xl shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all text-white font-bold"
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
