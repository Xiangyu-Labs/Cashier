import { CheckSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntryFilterPanel, type EntryFilters } from "@/modules/ledger/ui";
import type { PeriodParams } from "@/lib/period-utils";

interface LedgerEntriesToolbarProps {
  isSelectionMode: boolean;
  onToggleSelectionMode: () => void;
  filters: EntryFilters;
  onFiltersChange: (filters: EntryFilters) => void;
  periodParams: PeriodParams;
  onPeriodChange: (params: PeriodParams) => void;
  filteredTotalLabel: string;
  mainCurrency: string;
  filteredTotal: number;
}

export function LedgerEntriesToolbar({
  isSelectionMode,
  onToggleSelectionMode,
  filters,
  onFiltersChange,
  periodParams,
  onPeriodChange,
  filteredTotalLabel,
  mainCurrency,
  filteredTotal,
}: LedgerEntriesToolbarProps) {
  return (
    <div className="px-2 mb-2 sm:mb-4 flex items-center gap-2">
      <Button
        variant={isSelectionMode ? "secondary" : "ghost"}
        size="icon"
        onClick={onToggleSelectionMode}
        className="shrink-0 h-8 w-8"
      >
        {isSelectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
      </Button>

      <EntryFilterPanel
        filters={filters}
        onFiltersChange={onFiltersChange}
        periodParams={periodParams}
        onPeriodChange={onPeriodChange}
        showCategory={false}
        showCurrency={false}
        className="w-auto"
      />

      <span className="text-xs text-muted-foreground font-mono ml-auto">
        {filteredTotalLabel} {mainCurrency} {filteredTotal.toFixed(2)}
      </span>
    </div>
  );
}
