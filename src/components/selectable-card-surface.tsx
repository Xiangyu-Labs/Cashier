import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectableCardSurfaceProps {
  selectionMode: boolean;
  selected: boolean;
  selectionLabel: string;
  onToggleSelection: () => void;
  children: ReactNode;
}

export function SelectableCardSurface({
  selectionMode,
  selected,
  selectionLabel,
  onToggleSelection,
  children,
}: SelectableCardSurfaceProps) {
  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-xl)]",
        selectionMode && "isolate",
        selectionMode && selected && "ring-1 ring-primary"
      )}
      data-selection-mode={selectionMode ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
    >
      <div inert={selectionMode ? true : undefined}>{children}</div>
      {selectionMode ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selectionLabel}
          onClick={onToggleSelection}
          className="absolute inset-0 cursor-pointer touch-manipulation rounded-[var(--radius-xl)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm border border-primary bg-background text-primary-foreground",
              selected && "bg-primary"
            )}
          >
            {selected ? <Check className="size-4" /> : null}
          </span>
        </button>
      ) : null}
    </div>
  );
}
