"use client";

import * as React from "react";
import { Calendar as CalendarIcon, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { EntryCategory } from "@/types/api";
import { CategoryIcon } from "@/components/CategoryIcon";
import { PeriodParams, PeriodPreset } from "@/lib/period-utils";

export interface EntryFilters {
    startDate?: Date;
    endDate?: Date;
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
}

interface EntryFilterPanelProps {
    filters: EntryFilters;
    onFiltersChange: (filters: EntryFilters) => void;
    periodParams?: PeriodParams;
    onPeriodChange?: (params: PeriodParams) => void;
    categories?: EntryCategory[];
    preferredCurrencies?: string[];
    showCategory?: boolean;
    showCurrency?: boolean;
    className?: string;
}

export function EntryFilterPanel({
    filters,
    onFiltersChange,
    periodParams,
    onPeriodChange,
    categories = [],
    preferredCurrencies = [],
    showCategory = true,
    showCurrency = true,
    className,
}: EntryFilterPanelProps) {
    const t = useTranslations("EntryFilterPanel");
    const tDateRange = useTranslations("DateRangeFilter");
    const tSettings = useTranslations("Settings");
    const [open, setOpen] = React.useState(false);

    // Internal state for editing before applying
    const [tempFilters, setTempFilters] = React.useState<EntryFilters>(filters);
    const [tempPeriod, setTempPeriod] = React.useState<PeriodPreset | null>(null);

    // Sync temp filters when external filters change or popover opens
    React.useEffect(() => {
        setTempFilters(filters);
        setTempPeriod(null);
    }, [filters, open]);

    // Format date for input[type="date"]
    const formatDateInput = (date?: Date) => {
        if (!date) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    // Count advanced filters (category, currency, amount)
    const advancedFilterCount = [
        showCategory && filters.categoryId,
        showCurrency && filters.currency,
        filters.minAmount !== undefined && filters.minAmount !== null,
        filters.maxAmount !== undefined && filters.maxAmount !== null,
    ].filter(Boolean).length;

    // Get active preset from periodParams if available, otherwise derive from filters
    const activePreset: PeriodPreset = periodParams?.period ?? (() => {
        if (!filters.startDate && !filters.endDate) return "all";

        const now = new Date();
        const start = filters.startDate;
        const end = filters.endDate;

        if (!start || !end) return "custom";

        // Check thisMonth
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (start.getTime() === monthStart.getTime() &&
            end.getDate() === monthEnd.getDate() &&
            end.getMonth() === monthEnd.getMonth()) {
            return "thisMonth";
        }

        // Check past week (approximately)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (Math.abs(start.getTime() - weekAgo.getTime()) < 86400000) {
            return "week";
        }

        return "custom";
    })();

    // Map preset string to PeriodPreset type (only named presets, not legacy-only ones)
    const toNamedPreset = (preset: string): PeriodPreset | null => {
        if (preset === "all" || preset === "week" || preset === "thisMonth") return preset;
        return null;
    };

    // Legacy date preset handler for backward compatibility
    const handleDatePresetLegacy = (preset: string, applyImmediately = false) => {
        let newFilters = { ...filters };

        if (preset === "all") {
            newFilters = { ...newFilters, startDate: undefined, endDate: undefined };
        } else if (preset !== "custom") {
            const end = new Date();
            const start = new Date();

            switch (preset) {
                case "thisMonth":
                    start.setDate(1);
                    start.setHours(0, 0, 0, 0);
                    end.setMonth(end.getMonth() + 1, 0);
                    end.setHours(23, 59, 59, 999);
                    break;
                case "week":
                    start.setDate(end.getDate() - 7);
                    break;
                case "month":
                    start.setMonth(end.getMonth() - 1);
                    break;
                case "3months":
                    start.setMonth(end.getMonth() - 3);
                    break;
                case "6months":
                    start.setMonth(end.getMonth() - 6);
                    break;
                case "year":
                    start.setFullYear(end.getFullYear() - 1);
                    break;
            }

            newFilters = { ...newFilters, startDate: start, endDate: end };
        }

        if (applyImmediately) {
            onFiltersChange(newFilters);
        } else {
            setTempFilters(newFilters);
            setTempPeriod(toNamedPreset(preset));
        }
    };

    const handleApply = () => {
        onFiltersChange(tempFilters);
        if (tempPeriod !== null && onPeriodChange) {
            onPeriodChange({ period: tempPeriod });
        }
        setOpen(false);
    };

    const handleReset = () => {
        const now = new Date();
        const defaultFilters: EntryFilters = {
            startDate: new Date(now.getFullYear(), now.getMonth(), 1),
            endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
            categoryId: null,
            currency: null,
            minAmount: null,
            maxAmount: null,
        };
        setTempFilters(defaultFilters);
    };

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {/* Filters Button with Popover */}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-7 px-2.5 text-xs gap-1.5",
                            advancedFilterCount > 0 && "border-primary/50 text-primary"
                        )}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t("moreFilters")}</span>
                        {advancedFilterCount > 0 && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                                {advancedFilterCount}
                            </span>
                        )}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[380px] p-0" align="start">
                    <div className="p-4 space-y-4">
                        {/* Custom Date Range Section */}
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                <CalendarIcon className="h-3 w-3" />
                                {t("dateRange")}
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                                {([
                                    { preset: "all", label: t("allTime") },
                                    { preset: "week", label: tDateRange("pastWeek") },
                                    { preset: "thisMonth", label: tDateRange("thisMonth") },
                                    { preset: "month", label: tDateRange("pastMonth") },
                                    { preset: "3months", label: tDateRange("past3Months") },
                                ] as const).map(({ preset, label }) => {
                                    const displayPreset = tempPeriod ?? activePreset;
                                    const isActive = displayPreset === preset;
                                    return (
                                        <Button
                                            key={preset}
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "text-xs h-7",
                                                isActive && "bg-primary/10 text-primary font-medium"
                                            )}
                                            onClick={() => handleDatePresetLegacy(preset)}
                                        >
                                            {label}
                                        </Button>
                                    );
                                })}
                            </div>
                            <div className="flex gap-2 items-center">
                                <Input
                                    type="date"
                                    value={formatDateInput(tempFilters.startDate)}
                                    onChange={(e) => setTempFilters(prev => ({
                                        ...prev,
                                        startDate: e.target.value ? new Date(e.target.value) : undefined
                                    }))}
                                    className="flex-1 h-8 text-sm"
                                />
                                <span className="text-muted-foreground text-sm">-</span>
                                <Input
                                    type="date"
                                    value={formatDateInput(tempFilters.endDate)}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            const d = new Date(e.target.value);
                                            d.setHours(23, 59, 59, 999);
                                            setTempFilters(prev => ({ ...prev, endDate: d }));
                                        } else {
                                            setTempFilters(prev => ({ ...prev, endDate: undefined }));
                                        }
                                    }}
                                    className="flex-1 h-8 text-sm"
                                />
                            </div>
                        </div>

                        {/* Category Select */}
                        {showCategory && (
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">{t("category")}</div>
                                <Select
                                    value={tempFilters.categoryId || "__all__"}
                                    onValueChange={(value) => setTempFilters(prev => ({
                                        ...prev,
                                        categoryId: value === "__all__" ? null : value
                                    }))}
                                >
                                    <SelectTrigger className="w-full h-8 text-sm">
                                        <SelectValue placeholder={t("allCategories")} />
                                    </SelectTrigger>
                                    <SelectContent position="popper" sideOffset={4}>
                                        <SelectItem value="__all__">{t("allCategories")}</SelectItem>
                                        <SelectItem value="__uncategorized__">{tSettings("uncategorized")}</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id}>
                                                <CategoryIcon iconName={cat.icon} className="w-4 h-4 mr-2 inline-block" />
                                                {cat.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Currency Select */}
                        {showCurrency && preferredCurrencies.length > 0 && (
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">{t("currency")}</div>
                                <Select
                                    value={tempFilters.currency || "__all__"}
                                    onValueChange={(value) => setTempFilters(prev => ({
                                        ...prev,
                                        currency: value === "__all__" ? null : value
                                    }))}
                                >
                                    <SelectTrigger className="w-full h-8 text-sm">
                                        <SelectValue placeholder={t("allCurrencies")} />
                                    </SelectTrigger>
                                    <SelectContent position="popper" sideOffset={4}>
                                        <SelectItem value="__all__">{t("allCurrencies")}</SelectItem>
                                        {preferredCurrencies.map((curr) => (
                                            <SelectItem key={curr} value={curr}>
                                                {curr}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Price Range */}
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">{t("priceRange")}</div>
                            <div className="flex gap-2 items-center">
                                <Input
                                    type="number"
                                    placeholder={t("minAmount")}
                                    value={tempFilters.minAmount ?? ""}
                                    onChange={(e) => setTempFilters(prev => ({
                                        ...prev,
                                        minAmount: e.target.value ? Number(e.target.value) : null
                                    }))}
                                    className="flex-1 h-8 text-sm"
                                    min={0}
                                />
                                <span className="text-muted-foreground text-sm">-</span>
                                <Input
                                    type="number"
                                    placeholder={t("maxAmount")}
                                    value={tempFilters.maxAmount ?? ""}
                                    onChange={(e) => setTempFilters(prev => ({
                                        ...prev,
                                        maxAmount: e.target.value ? Number(e.target.value) : null
                                    }))}
                                    className="flex-1 h-8 text-sm"
                                    min={0}
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2 border-t">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1 h-8"
                                onClick={handleReset}
                            >
                                <X className="h-4 w-4 mr-1" />
                                {t("reset")}
                            </Button>
                            <Button
                                size="sm"
                                className="flex-1 h-8"
                                onClick={handleApply}
                            >
                                {t("apply")}
                            </Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
