import { memo, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectableCardSurfaceProps {
  selectionMode: boolean;
  selected: boolean;
  selectionLabel: string;
  onToggleSelection: () => void;
  indicatorPlacement?: "center" | "top" | "header";
  /**
   * When set, an expand/collapse control is rendered above the selection
   * overlay while in selection mode so cards with an expandable body keep
   * their chevron interactive during batch selection.
   */
  expandable?:
    | {
        isExpanded: boolean;
        onToggleExpanded: () => void;
        expandLabel: string;
      }
    | undefined;
  children: ReactNode;
}

const indicatorPositionClass: Record<
  NonNullable<SelectableCardSurfaceProps["indicatorPlacement"]>,
  string
> = {
  // Centered on the whole card — correct for single-row (non-expandable) cards.
  center: "top-1/2 -translate-y-1/2",
  // Aligned near the top edge — used for per-entry selection in detail views.
  top: "top-3",
  // Aligned with the header row (68px header => center at 34px). Keeps the
  // checkbox on the title line whether the card is expanded or collapsed.
  header: "top-[24px] -translate-y-1/2",
};

export const SelectableCardSurface = memo(function SelectableCardSurface({
  selectionMode,
  selected,
  selectionLabel,
  onToggleSelection,
  indicatorPlacement = "center",
  expandable,
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
              "absolute left-3 flex size-5 items-center justify-center rounded-sm border border-primary bg-background text-primary-foreground",
              indicatorPositionClass[indicatorPlacement],
              selected && "bg-primary"
            )}
          >
            {selected ? <Check className="size-4" /> : null}
          </span>
        </button>
      ) : null}
      {selectionMode && expandable ? (
        <button
          type="button"
          aria-label={expandable.expandLabel}
          aria-expanded={expandable.isExpanded}
          onClick={expandable.onToggleExpanded}
          className="absolute left-[44px] top-[12px] z-[1] flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-[var(--motion-feedback)] hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:top-[16px] sm:h-9 sm:w-9"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-[var(--motion-feedback)] ease-[var(--motion-state-ease)]",
              expandable.isExpanded && "rotate-180"
            )}
          />
        </button>
      ) : null}
    </div>
  );
});
