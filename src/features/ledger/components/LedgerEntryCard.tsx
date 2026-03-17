import { type LedgerEntry, type EntryCategory } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Checkbox } from "@/components/ui/checkbox";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { AmountDisplay } from "@/components/ui/amount-display";
import { parseAmount } from "@/lib/formatters";

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
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function LedgerEntryCard({
  ledgerEntry,
  onView,
  className,
  mainCurrency = "CNY",
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: LedgerEntryCardProps) {
  const t = useTranslations("Common");
  const tSourceDocumentCard = useTranslations("SourceDocumentCard");

  return (
    <Card
      className={cn(
        cardVariants({ status: "default" }),
        isSelected && "border-primary bg-primary/5",
        className
      )}
    >
      <CardContent className="py-2.5 px-3">
        <div
          className={cn(
            (onView || selectionMode) && "cursor-pointer hover:opacity-80 transition-opacity"
          )}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            // Don't trigger on interactive elements (except checkbox in selection mode)
            const isCheckbox = target.closest("[data-checkbox]");
            if (!isCheckbox && (target.closest("button") || target.closest("select") || target.closest("input"))) {
              return;
            }

            if (selectionMode && onToggleSelect) {
              onToggleSelect();
            } else if (onView) {
              onView();
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
              {/* Checkbox for selection mode */}
              {selectionMode && (
                <div
                  className="shrink-0"
                  data-checkbox="true"
                >
                  <Checkbox
                    checked={isSelected}
                    className="h-5 w-5"
                  />
                </div>
              )}
              <div className="h-8 w-8 flex items-center justify-center bg-surface2 rounded-full text-lg text-text shrink-0">
                <CategoryIcon
                  iconName={ledgerEntry.category?.icon}
                  className="w-4 h-4"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm text-text truncate">{ledgerEntry.itemName}</p>
                  {ledgerEntry.sourceDocument?.type === "manual" && (
                    <span className="text-[10px] text-muted-foreground bg-surface2 px-1.5 py-0.5 rounded shrink-0">
                      {tSourceDocumentCard("quickEntry")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {ledgerEntry.category ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
                      <span className="shrink-0">{ledgerEntry.category.name}</span>
                      {ledgerEntry.description && (
                        <span className="hidden sm:contents">
                          <span className="text-muted-foreground/30 ml-0.5 shrink-0">·</span>
                          <span className="truncate text-muted-foreground/50 text-[11px] italic flex-1">
                            {ledgerEntry.description}
                          </span>
                        </span>
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

            <AmountDisplay
              amount={parseAmount(ledgerEntry.amount)}
              currency={ledgerEntry.currency}
              mainCurrency={mainCurrency}
              date={ledgerEntry.sourceDocument?.entryDate || ledgerEntry.createdAt}
              size="md"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
