"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface EditableCategoryOption {
  id: string;
  name: string;
  icon: string | null;
}

interface EditableCategorySelectProps {
  value: string | null;
  categories: EditableCategoryOption[];
  onChange: (categoryId: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
}

export function EditableCategorySelect({
  value,
  categories,
  onChange,
  placeholder,
  className,
  disabled = false,
}: EditableCategorySelectProps) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const selectedCategory = categories.find((category) => category.id === value);

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
  };

  if (disabled) {
    return (
      <span
        className={cn(
          "inline-flex min-h-11 items-center gap-1 rounded px-3 py-1 text-sm",
          "bg-primary/10 text-primary",
          className
        )}
      >
        {selectedCategory ? (
          <>
            <CategoryIcon iconName={selectedCategory.icon} className="h-3.5 w-3.5" />
            <span className="font-medium">{selectedCategory.name}</span>
          </>
        ) : (
          <span>{placeholder}</span>
        )}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          className={cn(
            "inline-flex min-h-11 items-center gap-1 rounded px-3 py-1 text-sm",
            "cursor-pointer hover:bg-surface2 transition-colors",
            "border border-transparent hover:border-border/50",
            selectedCategory ? "bg-primary/10 text-primary" : "text-muted-foreground",
            className
          )}
        >
          {selectedCategory ? (
            <>
              <CategoryIcon iconName={selectedCategory.icon} className="h-3.5 w-3.5" />
              <span className="font-medium">{selectedCategory.name}</span>
            </>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start" sideOffset={4}>
        <div
          id={listboxId}
          role="listbox"
          aria-label={placeholder}
          className="max-h-[250px] overflow-y-auto subtle-scrollbar"
        >
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={value === category.id}
              onClick={() => handleSelect(category.id)}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                value === category.id ? "bg-accent text-accent-foreground" : "text-text"
              )}
            >
              <CategoryIcon iconName={category.icon} className="h-4 w-4" />
              <span className="flex-1 truncate">{category.name}</span>
              {value === category.id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
