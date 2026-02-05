"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

interface EditableFieldProps {
    value: string;
    onChange: (value: string) => void;
    type?: "text" | "number" | "textarea";
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    displayClassName?: string;
    renderDisplay?: (value: string) => ReactNode;
    disabled?: boolean;
    /** If true, save on blur. If false, show confirm/cancel buttons */
    saveOnBlur?: boolean;
}

export function EditableField({
    value,
    onChange,
    type = "text",
    placeholder = "",
    className,
    inputClassName,
    displayClassName,
    renderDisplay,
    disabled = false,
    saveOnBlur = true,
}: EditableFieldProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    // Sync local value when prop changes
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            if (inputRef.current instanceof HTMLInputElement) {
                inputRef.current.select();
            }
        }
    }, [isEditing]);

    const handleConfirm = () => {
        onChange(localValue);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setLocalValue(value);
        setIsEditing(false);
    };

    const handleBlur = () => {
        if (saveOnBlur) {
            handleConfirm();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && type !== "textarea") {
            e.preventDefault();
            handleConfirm();
        } else if (e.key === "Escape") {
            handleCancel();
        }
    };

    if (disabled) {
        return (
            <div className={cn("cursor-default", displayClassName, className)}>
                {renderDisplay ? renderDisplay(value) : (value || placeholder)}
            </div>
        );
    }

    if (isEditing) {
        const InputComponent = type === "textarea" ? Textarea : Input;
        return (
            <div className={cn("flex items-center gap-1", className)}>
                <InputComponent
                    ref={inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>}
                    type={type === "number" ? "number" : "text"}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={cn(
                        "h-auto py-0.5 px-1.5 min-h-0",
                        type === "textarea" ? "min-h-[60px]" : "",
                        inputClassName
                    )}
                />
                {!saveOnBlur && (
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="p-1 rounded hover:bg-primary/10 text-primary"
                        >
                            <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={cn(
                "cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 -my-0.5",
                "hover:bg-surface2 transition-colors",
                "border border-transparent hover:border-border/50",
                displayClassName,
                className
            )}
        >
            {renderDisplay ? renderDisplay(value) : (
                <span className={cn(!value && "text-muted-foreground/50")}>
                    {value || placeholder}
                </span>
            )}
        </div>
    );
}
