import { memo } from "react";
import { type LedgerEntry } from "@/types/api";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { AmountDisplay } from "@/components/ui/amount-display";
import { parseAmount } from "@/lib/formatters";

/**
 * Variant styles for different source document states.
 * The source document container determines the variant, and entries inherit the theme.
 */
const itemVariants = cva(
  "flex items-center justify-between py-2 px-3 rounded-lg transition-all cursor-pointer hover:opacity-80",
  {
    variants: {
      variant: {
        default: "bg-surface hover:bg-surface2/50",
        warning: "bg-warning/5 border border-warning/20",
        error: "bg-destructive/5 border border-destructive/20",
        info: "bg-primary/5 border border-primary/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface LedgerEntryItemProps extends VariantProps<typeof itemVariants> {
  ledgerEntry: LedgerEntry;
  mainCurrency?: string;
  sourceDocumentEntryDate?: string | null;
  onView?: () => void;
  className?: string;
}

/**
 * A simplified entry display component designed for embedding within source document cards.
 * Unlike LedgerEntryCard, this component:
 * - Inherits theme from parent via `variant` prop
 * - Has a more compact layout
 */
export const LedgerEntryItem = memo(function LedgerEntryItem({
  ledgerEntry,
  mainCurrency = "CNY",
  sourceDocumentEntryDate,
  onView,
  variant = "default",
  className,
}: LedgerEntryItemProps) {
  return (
    <div className={cn(itemVariants({ variant }), className)} onClick={onView}>
      {/* Left: Icon + Name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-8 w-8 flex items-center justify-center bg-surface2 rounded-full text-lg shrink-0">
          <CategoryIcon iconName={ledgerEntry.category?.icon} className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-medium text-text text-sm truncate">{ledgerEntry.itemName}</p>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {ledgerEntry.category != null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate min-w-0 flex-1">
                <span className="shrink-0">{ledgerEntry.category.name}</span>
                {ledgerEntry.description != null && ledgerEntry.description !== "" && (
                  <span className="hidden sm:contents">
                    <span className="text-muted-foreground/30 shrink-0">·</span>
                    <span className="truncate text-muted-foreground/60 text-[11px] italic">
                      {ledgerEntry.description}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Amount */}
      <AmountDisplay
        amount={parseAmount(ledgerEntry.amount)}
        currency={ledgerEntry.currency}
        mainCurrency={mainCurrency}
        date={sourceDocumentEntryDate ?? ledgerEntry.createdAt}
        size="sm"
        className="shrink-0 ml-3"
      />
    </div>
  );
});
