"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { DateFilter } from "@/components/ui/date-filter";
import { parseDateString } from "@/lib/date-utils";

interface EditableDateFieldProps {
    value: string; // yyyy-MM-dd format
    onChange: (value: string) => void;
    displayFormat?: Intl.DateTimeFormatOptions;
    locale?: string;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function EditableDateField({
    value,
    onChange,
    displayFormat = { year: "numeric", month: "long", day: "numeric" },
    locale = "zh-CN",
    placeholder = "选择日期",
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

    if (disabled) {
        return (
            <div className={cn("flex items-center gap-1.5 text-sm", className)}>
                <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
                <span>{formatDisplayDate(value)}</span>
            </div>
        );
    }

    if (isEditing) {
        return (
            <div className={cn("flex items-center gap-1.5", className)}>
                <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
                <DateFilter
                    value={value}
                    onChange={handleDateChange}
                    size="sm"
                    className="flex-1 min-w-0"
                />
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={cn(
                "flex items-center gap-1.5 cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 -my-0.5",
                "hover:bg-surface2 transition-colors",
                "border border-transparent hover:border-border/50",
                className
            )}
        >
            <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
            <span className={cn("text-sm", !value && "text-muted-foreground/50")}>
                {formatDisplayDate(value)}
            </span>
        </div>
    );
}
