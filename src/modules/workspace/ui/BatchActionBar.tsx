import type { ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BatchAction {
  label: string;
  iconLabel: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  pending?: boolean;
  disabled?: boolean;
}

interface BatchActionBarProps {
  selectedCount: number;
  selectedLabel: string;
  onClear: () => void;
  actions: BatchAction[];
}

export function BatchActionBar({
  selectedCount,
  selectedLabel,
  onClear,
  actions,
}: BatchActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="sticky bottom-3 z-action-bar rounded-lg border border-border bg-surface p-2 shadow-toast">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-h-9 rounded-md bg-surface2 px-3 py-2 text-sm font-medium text-text">
          {selectedLabel}
        </div>
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled === true || action.pending === true}
            aria-label={action.iconLabel}
            className={cn(
              "min-h-11 sm:min-h-9",
              action.variant === "danger" &&
                "border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
            )}
          >
            {action.pending === true ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              action.icon
            )}
            <span>{action.label}</span>
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClear}
          aria-label="Clear selection"
          className="h-11 w-11 sm:h-9 sm:w-9"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
