import { LedgerEntry, EntryCategory } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useConvertedAmount } from "@/features/currency/client/hooks/useConvertedAmount";

// Card styling variants
const cardVariants = cva("transition-all", {
  variants: {
    status: {
      default: "hover:border-primary/50",
    },
  },
  defaultVariants: {
    status: "default",
  },
});

import { useTranslations } from "next-intl";

interface LedgerEntryCardProps {
  ledgerEntry: LedgerEntry;
  categories: EntryCategory[];
  onView?: () => void;
  className?: string;
  mainCurrency?: string;
}

export function LedgerEntryCard({
  ledgerEntry,
  onView,
  className,
  mainCurrency = "CNY",
}: LedgerEntryCardProps) {
  const t = useTranslations("Common");
  const { converted } = useConvertedAmount(
    parseFloat(ledgerEntry.amount),
    ledgerEntry.currency,
    mainCurrency,
    ledgerEntry.entryDate || ledgerEntry.createdAt
  );

  const isDifferentCurrency = ledgerEntry.currency && ledgerEntry.currency !== mainCurrency && ledgerEntry.currency !== "unknown";

  return (
    <Card
      className={cn(
        cardVariants({ status: "default" }),
        className
      )}
    >
      <CardContent className="py-2.5 px-3">
        <div
          className={cn(onView && "cursor-pointer hover:opacity-80 transition-opacity")}
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
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
              <div className="h-8 w-8 flex items-center justify-center bg-surface2 rounded-full text-lg text-text shrink-0">
                <CategoryIcon
                  iconName={ledgerEntry.category?.icon}
                  className="w-4 h-4"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-text truncate">{ledgerEntry.itemName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {ledgerEntry.category ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
                      <span className="shrink-0">{ledgerEntry.category.name}</span>
                      {ledgerEntry.description && (
                        <>
                          <span className="text-muted-foreground/30 ml-0.5 shrink-0">·</span>
                          <span className="truncate text-muted-foreground/50 text-[11px] italic flex-1">
                            {ledgerEntry.description}
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="warning" className="text-[10px] px-1 h-5">
                        {t("needsCategory")}
                      </Badge>
                      {ledgerEntry.description && (
                        <span className="text-xs text-muted-foreground truncate">{ledgerEntry.description}</span>
                      )}
                    </div>
                  )}

                  {!ledgerEntry.currency && (
                    <Badge variant="warning" className="text-[10px] px-1 h-5">
                      {t("needsCurrency")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="flex flex-col items-end">
                <p className="font-mono font-semibold text-text">
                  <span className="text-xs text-muted-foreground mr-1">
                    {isDifferentCurrency ? mainCurrency : (ledgerEntry.currency || "?")}
                  </span>
                  {(isDifferentCurrency ? converted : parseFloat(ledgerEntry.amount)).toFixed(2)}
                </p>
                {isDifferentCurrency && (
                  <p className="text-[10px] text-muted-foreground-foreground font-mono opacity-60">
                    ≈ {ledgerEntry.currency} {parseFloat(ledgerEntry.amount).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
