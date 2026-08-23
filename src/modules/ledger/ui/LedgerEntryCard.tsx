import type { LedgerEntry } from "@/modules/ledger/contracts";
import { Badge } from "@/components/ui/badge";
import { EntryCardShell } from "@/components/entry-card-shell";
import { SelectableCardSurface } from "@/components/selectable-card-surface";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cn } from "@/lib/utils";
import { AmountDisplay } from "@/modules/currency/ui/AmountDisplay";

import { memo } from "react";
import { useTranslations } from "next-intl";

interface LedgerEntryCardProps {
  ledgerEntry: LedgerEntry;
  onView?: (entry: LedgerEntry) => void;
  className?: string;
  mainCurrency?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const LedgerEntryCard = memo(function LedgerEntryCard({
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
    <SelectableCardSurface
      selectionMode={selectionMode}
      selected={isSelected}
      selectionLabel={t("selectItem", { item: ledgerEntry.itemName })}
      onToggleSelection={() => onToggleSelect?.(ledgerEntry.id)}
    >
      <EntryCardShell
        selected={selectionMode && isSelected}
        interactive={onView != null || selectionMode}
        className={className}
        data-testid="ledger-entry-card-root"
        {...(!selectionMode && onView != null
          ? {
              role: "button",
              tabIndex: 0,
              onKeyDown: (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onView(ledgerEntry);
              },
            }
          : {})}
      >
        <div className="px-3 py-3 sm:px-4">
          <div
            className={cn(onView != null && !selectionMode && "cursor-pointer")}
            onClick={(e) => {
              if (selectionMode) return;
              const target = e.target as HTMLElement;
              if (target.closest("button") || target.closest("select") || target.closest("input")) {
                return;
              }
              onView?.(ledgerEntry);
            }}
          >
            <div className="flex items-center justify-between">
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 mr-3",
                  selectionMode && "pl-8"
                )}
              >
                <div className="h-8 w-8 flex items-center justify-center bg-surface2 rounded-full text-lg text-text shrink-0">
                  <CategoryIcon
                    {...(ledgerEntry.category?.icon !== undefined
                      ? { iconName: ledgerEntry.category.icon }
                      : {})}
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
                    {ledgerEntry.category && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
                        <span className="shrink-0">{ledgerEntry.category.name}</span>
                        {ledgerEntry.description != null && ledgerEntry.description !== "" && (
                          <span className="hidden sm:contents">
                            <span className="text-muted-foreground/30 ml-0.5 shrink-0">·</span>
                            <span className="truncate text-muted-foreground/50 text-[11px] italic flex-1">
                              {ledgerEntry.description}
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    {(ledgerEntry.currency == null || ledgerEntry.currency === "") && (
                      <Badge variant="warning" className="text-[10px] px-1 h-5">
                        {t("needsCurrency")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <AmountDisplay
                ledgerId={ledgerEntry.ledgerId}
                amount={ledgerEntry.amount}
                currency={ledgerEntry.currency}
                mainCurrency={mainCurrency}
                date={ledgerEntry.sourceDocument?.entryDate ?? ledgerEntry.createdAt}
                persistedConvertedAmount={ledgerEntry.convertedAmount}
                variant="item"
              />
            </div>
          </div>
        </div>
      </EntryCardShell>
    </SelectableCardSurface>
  );
});
