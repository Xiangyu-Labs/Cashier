import { LedgerEntry, EntryCategory } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useConvertedAmount } from "@/hooks/useConvertedAmount";

// Card styling variants
const cardVariants = cva("transition-all", {
  variants: {
    status: {
      default: "hover:border-primary/50",
      attention: "border-warning/50 bg-warning/5",
    },
  },
  defaultVariants: {
    status: "default",
  },
});

interface LedgerEntryCardProps {
  ledgerEntry: LedgerEntry;
  categories: EntryCategory[];
  onView?: () => void;
  hideCategory?: boolean;
  showStatusHint?: boolean;
  className?: string;
  mainCurrency?: string;
}

export function LedgerEntryCard({
  ledgerEntry,
  categories,
  onView,
  hideCategory = false,
  showStatusHint = false,
  className,
  mainCurrency = "CNY",
}: LedgerEntryCardProps) {
  const isUnknownCurrency = !ledgerEntry.currency || ledgerEntry.currency === "unknown";
  const needsAttention = !ledgerEntry.categoryId || isUnknownCurrency;

  const { converted, isLoading } = useConvertedAmount(
    parseFloat(ledgerEntry.amount),
    ledgerEntry.currency,
    mainCurrency,
    ledgerEntry.entryDate || ledgerEntry.createdAt
  );

  const isDifferentCurrency = ledgerEntry.currency && ledgerEntry.currency !== mainCurrency && ledgerEntry.currency !== "unknown";

  return (
    <Card
      className={cn(
        cardVariants({ status: needsAttention ? "attention" : "default" }),
        className
      )}
    >
      <CardContent className="p-4">
        <div
          className={cn("space-y-2", onView && "cursor-pointer hover:opacity-80 transition-opacity")}
          onClick={(e) => {
            if (onView) {
              // Prevent detail view when clicking interactive elements if any were added
              const target = e.target as HTMLElement;
              if (!target.closest("button") && !target.closest("select") && !target.closest("input")) {
                onView();
              }
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0 flex-1 mr-4">
              {!hideCategory && (
                <div className="h-10 w-10 flex items-center justify-center bg-surface2 rounded-full text-xl text-text">
                  <CategoryIcon
                    iconName={ledgerEntry.category?.icon}
                    className="w-6 h-6"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text truncate">{ledgerEntry.itemName}</p>
                <div className="flex items-center gap-2 mt-1">
                  {ledgerEntry.category ? (
                    !hideCategory && (
                      <div className="flex items-center gap-1.5 text-xs text-muted min-w-0 flex-1">
                        <span className="shrink-0">{ledgerEntry.category.name}</span>
                        {ledgerEntry.description && (
                          <>
                            <span className="text-muted/30 ml-0.5 shrink-0">·</span>
                            <span className="truncate text-muted/50 text-[11px] italic flex-1">
                              {ledgerEntry.description}
                            </span>
                          </>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="warning" className="text-[10px] px-1 h-5">
                        需分类
                      </Badge>
                      {ledgerEntry.description && (
                        <span className="text-xs text-muted truncate">{ledgerEntry.description}</span>
                      )}
                    </div>
                  )}

                  {!ledgerEntry.currency && (
                    <Badge variant="warning" className="text-[10px] px-1 h-5">
                      需货币
                    </Badge>
                  )}

                  {showStatusHint && needsAttention && (
                    <span className="ml-auto text-[11px] font-medium text-warning animate-pulse">
                      (待修正)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="flex flex-col items-end">
                <p className="font-mono font-semibold text-text">
                  <span className="text-xs text-muted mr-1">
                    {isDifferentCurrency ? mainCurrency : (ledgerEntry.currency || "?")}
                  </span>
                  {(isDifferentCurrency ? converted : parseFloat(ledgerEntry.amount)).toFixed(2)}
                </p>
                {isDifferentCurrency && (
                  <p className="text-[10px] text-muted-foreground font-mono opacity-60">
                    ≈ {ledgerEntry.currency} {parseFloat(ledgerEntry.amount).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>
          {/* Description is now inline with category above */}
        </div>
      </CardContent>
    </Card>
  );
}
