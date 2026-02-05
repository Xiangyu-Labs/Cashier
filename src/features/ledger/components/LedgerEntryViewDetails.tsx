"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LedgerEntry, EntryCategory } from "@/types/api";
import { Trash2, ChevronDown, ChevronUp, FileText, Save, X } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { type ReactNode, useState, useRef, useEffect, memo, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { useConvertedAmount } from "@/features/currency/client/hooks/useConvertedAmount";
import { motion, AnimatePresence } from "framer-motion";
import { EditableField } from "@/components/ui/editable-field";
import { EditableDateField } from "@/components/ui/editable-date-field";
import { EditableCategorySelect } from "@/components/ui/editable-category-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Types for pending changes
export interface EntryPendingChanges {
    itemName?: string;
    amount?: number;
    currency?: string;
    categoryId?: string | null;
    entryDate?: string;
    description?: string | null;
}

interface LedgerEntryViewDetailsProps {
    ledgerEntry: LedgerEntry;
    categories: EntryCategory[];
    preferredCurrencies?: string[];
    mainCurrency?: string;
    pendingChanges: EntryPendingChanges;
    onFieldChange: (changes: EntryPendingChanges) => void;
    onSave: () => void;
    onDiscard: () => void;
    onDelete: () => void;
    onViewSourceDocument?: () => void;
}

export const LedgerEntryViewDetails = memo(function LedgerEntryViewDetails({
    ledgerEntry,
    categories,
    preferredCurrencies = [],
    mainCurrency = "CNY",
    pendingChanges,
    onFieldChange,
    onSave,
    onDiscard,
    onDelete,
    onViewSourceDocument,
}: LedgerEntryViewDetailsProps): ReactNode {
    const t = useTranslations("LedgerEntryDetail");
    const tCommon = useTranslations("Common");
    const locale = useLocale();

    // Merge pending changes with original data
    const displayData = useMemo(() => ({
        itemName: pendingChanges.itemName ?? ledgerEntry.itemName,
        amount: pendingChanges.amount ?? parseFloat(ledgerEntry.amount),
        currency: pendingChanges.currency ?? ledgerEntry.currency,
        categoryId: pendingChanges.categoryId !== undefined ? pendingChanges.categoryId : ledgerEntry.categoryId,
        entryDate: pendingChanges.entryDate ?? ledgerEntry.entryDate ?? "",
        description: pendingChanges.description !== undefined ? pendingChanges.description : ledgerEntry.description,
    }), [pendingChanges, ledgerEntry]);

    const hasPendingChanges = Object.keys(pendingChanges).length > 0;

    const { converted } = useConvertedAmount(
        displayData.amount,
        displayData.currency,
        mainCurrency,
        displayData.entryDate || ledgerEntry.createdAt
    );

    const isDifferentCurrency = displayData.currency && displayData.currency !== mainCurrency && displayData.currency !== "unknown";

    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [needsFolding, setNeedsFolding] = useState(false);
    const descriptionRef = useRef<HTMLDivElement>(null);

    // Check if description needs folding
    useEffect(() => {
        if (displayData.description && descriptionRef.current) {
            const element = descriptionRef.current;
            const isClamped = element.classList.contains("line-clamp-3");
            if (isClamped) element.classList.remove("line-clamp-3");
            const fullHeight = element.scrollHeight;
            element.classList.add("line-clamp-3");
            const clampedHeight = element.clientHeight;
            setNeedsFolding(fullHeight > clampedHeight);
            if (isDescriptionExpanded) {
                element.classList.remove("line-clamp-3");
            }
        }
    }, [displayData.description, isDescriptionExpanded]);

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString(locale);
    };

    const handleFieldChange = useCallback(<K extends keyof EntryPendingChanges>(
        field: K,
        value: EntryPendingChanges[K]
    ) => {
        onFieldChange({ [field]: value });
    }, [onFieldChange]);

    const sortedCurrencies = useMemo(() => {
        const preferred = preferredCurrencies.filter(c => c !== "unknown");
        const remaining = SUPPORTED_CURRENCIES.filter(c => !preferred.includes(c));
        return [...preferred, ...remaining.sort()];
    }, [preferredCurrencies]);

    const category = categories.find(c => c.id === displayData.categoryId);

    return (
        <div className="flex flex-col h-full max-h-[inherit]">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 subtle-scrollbar">
                {/* Header Info */}
                <div className="flex items-start gap-4">
                    {/* Category Icon - Clickable to change */}
                    <EditableCategorySelect
                        value={displayData.categoryId}
                        categories={categories}
                        onChange={(categoryId) => handleFieldChange("categoryId", categoryId)}
                        className="h-16 w-16 rounded-2xl"
                    />

                    <div className="flex-1 space-y-2">
                        {/* Editable Item Name */}
                        <EditableField
                            value={displayData.itemName}
                            onChange={(v) => handleFieldChange("itemName", v)}
                            placeholder={t("itemName")}
                            displayClassName="text-xl font-semibold text-text break-words"
                            inputClassName="font-semibold text-lg"
                        />

                        {/* Editable Amount with Currency */}
                        <div className="mt-1">
                            <div className="flex items-baseline gap-2">
                                {/* Currency Selector */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className="text-lg font-normal text-muted-foreground hover:text-text transition-colors flex items-center gap-1">
                                            {isDifferentCurrency ? mainCurrency : (displayData.currency === "unknown" ? "?" : displayData.currency)}
                                            <ChevronDown className="h-3 w-3 opacity-50" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-28 p-1" align="start">
                                        <div className="max-h-48 overflow-y-auto">
                                            {sortedCurrencies.map(curr => (
                                                <button
                                                    key={curr}
                                                    onClick={() => handleFieldChange("currency", curr)}
                                                    className={cn(
                                                        "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors",
                                                        displayData.currency === curr && "bg-accent"
                                                    )}
                                                >
                                                    {curr}
                                                </button>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>

                                {/* Editable Amount */}
                                <EditableField
                                    value={(isDifferentCurrency ? converted : displayData.amount).toFixed(2)}
                                    onChange={(v) => handleFieldChange("amount", parseFloat(v) || 0)}
                                    type="number"
                                    displayClassName="text-3xl font-bold text-primary"
                                    inputClassName="text-2xl font-bold text-primary w-32"
                                />
                            </div>

                            {isDifferentCurrency && (
                                <p className="text-sm font-medium text-muted-foreground mt-0.5 opacity-80">
                                    ≈ {displayData.currency} {displayData.amount.toFixed(2)}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="rounded-lg border border-border bg-surface2/30 p-4 space-y-4">
                    {/* Date and Category */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Date - Editable */}
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-muted-foreground shrink-0">{t("entryDate")}:</span>
                            <EditableDateField
                                value={displayData.entryDate}
                                onChange={(date) => handleFieldChange("entryDate", date)}
                                locale={locale}
                                className="flex-1 min-w-0 text-sm"
                            />
                        </div>

                        {/* Category Display */}
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-muted-foreground shrink-0">{t("category")}:</span>
                            {category ? (
                                <Badge variant="default" className="font-normal bg-primary/10 text-primary hover:bg-primary/20 border-none transition-colors">
                                    <CategoryIcon iconName={category.icon} className="h-3 w-3 mr-1.5" />
                                    {category.name}
                                </Badge>
                            ) : (
                                <span className="text-sm text-muted-foreground italic">{t("noCategory")}</span>
                            )}
                        </div>
                    </div>

                    {/* Description - Editable */}
                    <div className="border-t border-border/50 pt-4 mt-2">
                        <EditableField
                            value={displayData.description || ""}
                            onChange={(v) => handleFieldChange("description", v || null)}
                            type="textarea"
                            placeholder={t("addDescription")}
                            displayClassName="text-sm text-text"
                            inputClassName="min-h-[80px] text-sm"
                            renderDisplay={(value) => (
                                value ? (
                                    <div className="text-sm text-text">
                                        <AnimatePresence initial={false}>
                                            <motion.div
                                                ref={descriptionRef}
                                                initial={false}
                                                className={`break-words whitespace-pre-wrap ${!isDescriptionExpanded ? "line-clamp-3" : ""}`}
                                            >
                                                {value}
                                            </motion.div>
                                        </AnimatePresence>
                                        {needsFolding && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsDescriptionExpanded(!isDescriptionExpanded);
                                                }}
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
                                    <span className="text-sm text-muted-foreground/50 italic">{t("noDescription")}</span>
                                )
                            )}
                        />
                    </div>

                    {/* Created At */}
                    <div className="flex justify-between items-center border-t border-border/50 pt-4">
                        <span className="text-sm text-muted-foreground">{t("createdAt")}</span>
                        <span className="text-sm text-text">
                            {formatDateTime(ledgerEntry.createdAt)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions Footer */}
            <div className="shrink-0 flex justify-between items-center gap-3 p-4 border-t border-border/50 bg-surface/50 backdrop-blur-sm sm:rounded-b-lg">
                {/* Left Actions */}
                <div className="flex gap-2">
                    {onViewSourceDocument && (
                        <Button
                            variant="outline"
                            onClick={onViewSourceDocument}
                            size="sm"
                            className="h-9 px-3 gap-1.5 text-primary border-primary/20 hover:bg-primary/5"
                        >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{t("viewSource")}</span>
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        onClick={onDelete}
                        size="sm"
                        className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{tCommon("delete")}</span>
                    </Button>
                </div>

                {/* Right Actions - Save/Discard when changes pending */}
                <AnimatePresence>
                    {hasPendingChanges && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-2"
                        >
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onDiscard}
                                className="h-9"
                            >
                                <X className="h-3.5 w-3.5 mr-1.5" />
                                {t("discardChanges")}
                            </Button>
                            <Button
                                size="sm"
                                onClick={onSave}
                                className="h-9 gap-1.5 shadow-lg shadow-primary/20"
                            >
                                <Save className="h-3.5 w-3.5" />
                                {tCommon("save")}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
});
