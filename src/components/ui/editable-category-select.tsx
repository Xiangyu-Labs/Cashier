"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { type EntryCategory } from "@/types/api";

interface EditableCategorySelectProps {
  value: string | null; // categoryId
  categories: EntryCategory[];
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

  const selectedCategory = categories.find((c) => c.id === value);

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
  };

  if (disabled) {
    return (
      <Badge
        variant="default"
        className={cn("font-normal bg-primary/10 text-primary border-none", className)}
      >
        {selectedCategory ? (
          <>
            <CategoryIcon iconName={selectedCategory.icon} className="h-3 w-3 mr-1.5" />
            {selectedCategory.name}
          </>
        ) : (
          placeholder
        )}
      </Badge>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm",
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
        <div className="max-h-[250px] overflow-y-auto subtle-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleSelect(cat.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                value === cat.id ? "bg-accent text-accent-foreground" : "text-text"
              )}
            >
              <CategoryIcon iconName={cat.icon} className="h-4 w-4" />
              <span className="flex-1 truncate">{cat.name}</span>
              {value === cat.id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
