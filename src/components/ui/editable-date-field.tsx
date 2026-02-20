"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { DateFilter } from "@/components/ui/date-filter";
import { parseDateString } from "@/lib/date-utils";

interface EditableDateFieldProps {
    value: string; // yyyy-MM-dd format
    onChange: (value: string) => void;
    placeholder: string;
    displayFormat?: Intl.DateTimeFormatOptions;
    locale?: string;
    className?: string;
    disabled?: boolean;
}

export function EditableDateField({
    value,
    onChange,
    placeholder,
    displayFormat = { year: "numeric", month: "long", day: "numeric" },
    locale = "zh-CN",
    className,
    disabled = false,
}: EditableDateFieldProps) {
    const [isEditing, setIsEditing] = useState(false);

    const formatDisplayDate = (dateStr: string) => {
        if (!dateStr) return placeholder;
        try {
            return parseDateString(dateStr).toLocaleDateString(locale, displayFormat);
        } catch {
            return dateStr;
        }
    };

    const handleDateChange = (date: Date | null) => {
        if (date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, "0");
            const d = String(date.getDate()).padStart(2, "0");
            onChange(`${y}-${m}-${d}`);
        }
        setIsEditing(false);
    };

    // Shared container styles for both modes to prevent layout shift
    const containerStyles = cn(
        "relative inline-flex items-center gap-1.5",
        "rounded px-1.5 py-0.5 -mx-1.5 -my-0.5",
        "transition-all duration-150 ease-out",
        className
    );

    if (disabled) {
        return (
            <div className={cn(containerStyles, "text-sm")}>
                <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
                <span>{formatDisplayDate(value)}</span>
            </div>
        );
    }

    if (isEditing) {
        return (
            <div className={cn(containerStyles, "bg-surface2 border border-border/50")}>
                <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
                <DateFilter
                    value={value}
                    onChange={handleDateChange}
                    size="sm"
                    className="flex-1 min-w-0 border-0 bg-transparent shadow-none p-0 focus-visible:ring-0"
                />
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={cn(
                containerStyles,
                "cursor-pointer hover:bg-surface2 border border-transparent hover:border-border/50"
            )}
        >
            <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
            <span className={cn("text-sm", !value && "text-muted-foreground/50")}>
                {formatDisplayDate(value)}
            </span>
        </div>
    );
}
