import { LedgerEntry } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useConvertedAmount } from "@/hooks/useConvertedAmount";

/**
 * Variant styles for different bill states.
 * The bill container determines the variant, and entries inherit the theme.
 */
const itemVariants = cva(
    "flex items-center justify-between py-3 px-3 rounded-lg transition-all cursor-pointer hover:opacity-80",
    {
        variants: {
            variant: {
                default: "bg-surface hover:bg-surface2/50",
                warning: "bg-warning/5 border border-warning/20",
                error: "bg-destructive/5 border border-destructive/20",
                info: "bg-info/5 border border-info/20",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

export interface BillEntryItemProps extends VariantProps<typeof itemVariants> {
    ledgerEntry: LedgerEntry;
    mainCurrency?: string;
    onView?: () => void;
    className?: string;
}

/**
 * A simplified entry display component designed for embedding within bill cards.
 * Unlike LedgerEntryCard, this component:
 * - Inherits theme from parent via `variant` prop
 * - Has a more compact layout
 * - Displays inline status warnings for missing data
 */
export function BillEntryItem({
    ledgerEntry,
    mainCurrency = "CNY",
    onView,
    variant = "default",
    className,
}: BillEntryItemProps) {
    const isUnknownCurrency = !ledgerEntry.currency || ledgerEntry.currency === "unknown";
    const needsCategory = !ledgerEntry.categoryId;

    const { converted } = useConvertedAmount(
        parseFloat(ledgerEntry.amount),
        ledgerEntry.currency,
        mainCurrency,
        ledgerEntry.entryDate || ledgerEntry.createdAt
    );

    const isDifferentCurrency =
        ledgerEntry.currency &&
        ledgerEntry.currency !== mainCurrency &&
        ledgerEntry.currency !== "unknown";

    return (
        <div
            className={cn(itemVariants({ variant }), className)}
            onClick={onView}
        >
            {/* Left: Icon + Name + Badges */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-8 w-8 flex items-center justify-center bg-surface2 rounded-full text-lg shrink-0">
                    <CategoryIcon
                        iconName={ledgerEntry.category?.icon}
                        className="w-5 h-5"
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="font-medium text-text text-sm truncate">
                        {ledgerEntry.itemName}
                    </p>

                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        {ledgerEntry.category && (
                            <div className="flex items-center gap-1 text-xs text-muted truncate min-w-0 flex-1">
                                <span className="shrink-0">{ledgerEntry.category.name}</span>
                                {ledgerEntry.description && (
                                    <>
                                        <span className="text-muted/30 shrink-0">·</span>
                                        <span className="truncate text-muted/60 text-[11px] italic">
                                            {ledgerEntry.description}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Warning badges for missing data */}
                        {needsCategory && (
                            <Badge variant="warning" className="text-[9px] px-1 h-4">
                                需分类
                            </Badge>
                        )}
                        {isUnknownCurrency && (
                            <Badge variant="warning" className="text-[9px] px-1 h-4">
                                需货币
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Amount */}
            <div className="flex flex-col items-end shrink-0 ml-3">
                <p className="font-mono font-semibold text-sm text-text">
                    <span className="text-xs text-muted mr-1">
                        {isDifferentCurrency ? mainCurrency : (ledgerEntry.currency || "?")}
                    </span>
                    {(isDifferentCurrency ? converted : parseFloat(ledgerEntry.amount)).toFixed(2)}
                </p>
                {isDifferentCurrency && (
                    <p className="text-[9px] text-muted-foreground font-mono opacity-60">
                        ≈ {ledgerEntry.currency} {parseFloat(ledgerEntry.amount).toFixed(2)}
                    </p>
                )}
            </div>
        </div>
    );
}
