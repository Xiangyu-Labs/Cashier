"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
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
    /** Minimum rows for textarea */
    minRows?: number;
    /** Maximum rows for textarea before scrolling */
    maxRows?: number;
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
    minRows = 1,
    maxRows = 10,
}: EditableFieldProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Sync local value when prop changes
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Auto-resize textarea
    const autoResizeTextarea = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea || type !== "textarea") return;

        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = "auto";

        // Calculate line height (approximate if not available)
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
        const minHeight = lineHeight * minRows;
        const maxHeight = lineHeight * maxRows;

        // Set new height based on content, clamped to min/max
        const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
        textarea.style.height = `${newHeight}px`;
    }, [type, minRows, maxRows]);

    // Focus input and auto-resize textarea when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            if (inputRef.current instanceof HTMLInputElement) {
                inputRef.current.select();
            }
        }
        if (isEditing && type === "textarea") {
            // Small delay to ensure content is rendered
            requestAnimationFrame(autoResizeTextarea);
        }
    }, [isEditing, type, autoResizeTextarea]);

    // Auto-resize when value changes during editing
    useEffect(() => {
        if (isEditing && type === "textarea") {
            autoResizeTextarea();
        }
    }, [localValue, isEditing, type, autoResizeTextarea]);

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
        if (e.key === "Enter") {
            if (e.shiftKey && type === "textarea") {
                // Shift+Enter in textarea: allow default (new line)
                return;
            }
            // Enter (or Shift+Enter in non-textarea): save
            e.preventDefault();
            handleConfirm();
        } else if (e.key === "Escape") {
            handleCancel();
        }
    };

    // Shared container styles for both modes to prevent layout shift
    const containerStyles = cn(
        "relative inline-flex items-center w-full",
        "rounded px-0.5 py-0 -mx-0.5 -my-0",
        "transition-all duration-150 ease-out",
        className
    );

    // Interactive styles only applied when not disabled and not editing
    const interactiveStyles = !disabled && !isEditing
        ? "cursor-pointer hover:bg-surface2 border border-transparent hover:border-border/50"
        : "";

    if (disabled) {
        return (
            <div className={cn(containerStyles, displayClassName)}>
                {renderDisplay ? renderDisplay(value) : (value || placeholder)}
            </div>
        );
    }

    if (isEditing) {
        const InputComponent = type === "textarea" ? Textarea : Input;
        const isTextarea = type === "textarea";

        return (
            <div
                className={cn(containerStyles, "bg-surface2/50 border-border/50", displayClassName)}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex-1 min-w-0 relative">
                    <InputComponent
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        // Type assertion needed because React's ref typing doesn't handle
// conditional refs well. This is a known TypeScript limitation with union ref types.
// The runtime behavior is correct - both refs point to valid HTML elements.
ref={isTextarea ? textareaRef : inputRef as any}
                        type={type === "number" ? "number" : "text"}
                        value={localValue}
                        onChange={(e) => setLocalValue(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        rows={isTextarea ? minRows : undefined}
                        className={cn(
                            // Remove default styling that causes shifts
                            "border-0 bg-transparent shadow-none",
                            "p-0 m-0 w-full",
                            "focus-visible:ring-0 focus-visible:ring-offset-0",
                            // Inherit typography from display mode
                            "text-inherit font-inherit leading-inherit",
                            // Compact height for non-textarea inputs
                            !isTextarea && "h-auto px-1",
                            // Textarea specific
                            isTextarea && "resize-none overflow-hidden min-h-0",
                            inputClassName
                        )}
                        style={{
                            // Ensure font size matches display
                            fontSize: "inherit",
                            lineHeight: "inherit",
                            fontWeight: "inherit",
                        }}
                    />
                </div>
                {!saveOnBlur && (
                    <div className="flex items-center gap-0.5 shrink-0 ml-1">
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
            className={cn(containerStyles, interactiveStyles, displayClassName)}
        >
            {renderDisplay ? renderDisplay(value) : (
                <span className={cn(!value && "text-muted-foreground/50", "truncate")}>
                    {value || placeholder}
                </span>
            )}
        </div>
    );
}
