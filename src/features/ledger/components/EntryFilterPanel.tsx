"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Filter, X, ChevronDown } from "lucide-react";
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
import { useTranslations, useFormatter } from "next-intl";
import { EntryCategory } from "@/types/api";

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
    categories: EntryCategory[];
    preferredCurrencies: string[];
    className?: string;
}

export function EntryFilterPanel({
    filters,
    onFiltersChange,
    categories,
    preferredCurrencies,
    className,
}: EntryFilterPanelProps) {
    const t = useTranslations("EntryFilterPanel");
    const tDateRange = useTranslations("DateRangeFilter");
    const format = useFormatter();
    const [open, setOpen] = React.useState(false);

    // Internal state for editing before applying
    const [tempFilters, setTempFilters] = React.useState<EntryFilters>(filters);

    // Sync temp filters when external filters change or popover opens
    React.useEffect(() => {
        setTempFilters(filters);
    }, [filters, open]);

    // Format date for input[type="date"]
    const formatDateInput = (date?: Date) => {
        if (!date) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    // Count active filters (excluding default date range)
    const activeFilterCount = [
        filters.categoryId,
        filters.currency,
        filters.minAmount !== undefined && filters.minAmount !== null,
        filters.maxAmount !== undefined && filters.maxAmount !== null,
    ].filter(Boolean).length;

    // Handle date presets
    const handleDatePreset = (preset: "all" | "thisMonth" | "week" | "month" | "3months" | "6months" | "year") => {
        if (preset === "all") {
            setTempFilters(prev => ({ ...prev, startDate: undefined, endDate: undefined }));
            return;
        }

        const end = new Date();
        const start = new Date();

        switch (preset) {
            case "thisMonth":
                start.setDate(1);
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

        setTempFilters(prev => ({ ...prev, startDate: start, endDate: end }));
    };

    const handleApply = () => {
        onFiltersChange(tempFilters);
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

    // Format display for trigger button
    const getDisplayText = () => {
        if (!filters.startDate && !filters.endDate) {
            return t("allTime");
        }
        if (filters.startDate && filters.endDate) {
            const startStr = format.dateTime(filters.startDate, { month: "short", day: "numeric" });
            const endStr = format.dateTime(filters.endDate, { month: "short", day: "numeric" });
            return `${startStr} - ${endStr}`;
        }
        return t("filter");
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-8 justify-start text-left font-normal gap-2",
                        activeFilterCount > 0 && "border-primary/50",
                        className
                    )}
                >
                    <Filter className="h-4 w-4 shrink-0" />
                    <span className="truncate">{getDisplayText()}</span>
                    {activeFilterCount > 0 && (
                        <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {activeFilterCount}
                        </span>
                    )}
                    <ChevronDown className="ml-auto h-4 w-4 opacity-50 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[380px] p-0" align="start">
                <div className="p-4 space-y-4">
                    {/* Date Range Section */}
                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                            <CalendarIcon className="h-3 w-3" />
                            {t("dateRange")}
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleDatePreset("all")}>
                                {t("allTime")}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleDatePreset("thisMonth")}>
                                {tDateRange("thisMonth")}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleDatePreset("week")}>
                                {tDateRange("pastWeek")}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleDatePreset("month")}>
                                {tDateRange("pastMonth")}
                            </Button>
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
                                {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.icon && <span className="mr-2">{cat.icon}</span>}
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Currency Select */}
                    {preferredCurrencies.length > 0 && (
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
    );
}
