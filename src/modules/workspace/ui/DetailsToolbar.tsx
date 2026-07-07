import type { ReactNode } from "react";
import { ArrowLeft, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BatchActionBar, type BatchAction } from "./BatchActionBar";

interface DetailsToolbarProps {
  hasEntries: boolean;
  isSelectionMode: boolean;
  selectedCount: number;
  selectedLabel: string;
  totalLabel: string;
  onToggleSelectionMode: () => void;
  onClearSelection: () => void;
  batchActions: BatchAction[];
  children?: ReactNode;
}

export function DetailsToolbar({
  hasEntries,
  isSelectionMode,
  selectedCount,
  selectedLabel,
  totalLabel,
  onToggleSelectionMode,
  onClearSelection,
  batchActions,
  children,
}: DetailsToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
        {hasEntries && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleSelectionMode}
            aria-label={isSelectionMode ? "Cancel selection" : "Select entries"}
            className="h-11 w-11 sm:h-9 sm:w-9"
          >
            {isSelectionMode ? (
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            ) : (
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        )}

        {!isSelectionMode && children}

        <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
          {totalLabel}
        </span>
      </div>

      {isSelectionMode && (
        <BatchActionBar
          selectedCount={selectedCount}
          selectedLabel={selectedLabel}
          onClear={onClearSelection}
          actions={batchActions}
        />
      )}
    </div>
  );
}
