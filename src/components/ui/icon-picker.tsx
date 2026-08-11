"use client";
import { useId, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryIcon } from "@/components/CategoryIcon";
import { COMMON_LUCIDE_ICONS, type CommonLucideIcon } from "@/config/icons";
import { cn } from "@/lib/utils";

export interface IconPickerProps {
  value: string | null | undefined;
  onChange: (iconName: string) => void;
  messages: {
    select: string;
    selected: (name: string) => string;
    list: string;
    iconNames: Record<CommonLucideIcon, string>;
  };
  disabled?: boolean;
  className?: string;
}

export function IconPicker({
  value,
  onChange,
  messages,
  disabled = false,
  className,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();

  const handleSelect = (iconName: string) => {
    onChange(iconName);
    setOpen(false);
  };
  const selectedName =
    value != null && value in messages.iconNames
      ? messages.iconNames[value as CommonLucideIcon]
      : value;

  if (disabled) {
    return (
      <div className={cn("w-6 h-6", className)}>
        <CategoryIcon iconName={value ?? null} className="w-6 h-6" />
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-label={value == null ? messages.select : messages.selected(selectedName ?? value)}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded",
            "hover:bg-surface transition-colors",
            "border border-transparent hover:border-border/50",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            className
          )}
        >
          <CategoryIcon iconName={value ?? null} className="w-6 h-6" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start" sideOffset={4}>
        <div
          id={listboxId}
          role="listbox"
          aria-label={messages.list}
          className="grid grid-cols-6 gap-1"
        >
          {COMMON_LUCIDE_ICONS.map((iconName) => {
            const isSelected = value === iconName;
            const localizedName = messages.iconNames[iconName];
            return (
              <button
                key={iconName}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={localizedName}
                onClick={() => handleSelect(iconName)}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded",
                  "hover:bg-surface2 transition-colors",
                  isSelected && "ring-2 ring-primary bg-primary/10"
                )}
                title={localizedName}
              >
                <CategoryIcon iconName={iconName} className="w-5 h-5" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
