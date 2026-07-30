import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface EntryCardShellProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  interactive?: boolean;
}

export function EntryCardShell({
  selected = false,
  interactive = false,
  className,
  ...props
}: EntryCardShellProps) {
  return (
    <div
      className={cn(
        "min-h-[68px] overflow-hidden rounded-[var(--radius-xl)] border bg-surface text-text shadow-[0_1px_2px_color-mix(in_srgb,var(--text),transparent_95%)] transition-[border-color,background-color,box-shadow,opacity]",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border",
        interactive &&
          "cursor-pointer hover:border-primary/50 hover:shadow-sm focus-within:border-primary/50",
        className
      )}
      {...props}
    />
  );
}
