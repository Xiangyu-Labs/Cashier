"use client";

import { useLocale } from "next-intl";
import type { EntryCategory, LedgerEntry } from "@/modules/ledger/contracts";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { EntryGroupHeader } from "@/components/EntryGroupHeader";
import { LedgerEntryCard } from "./LedgerEntryCard";

interface LedgerEntryGroupsViewProps {
  groups: readonly { title: string; items: LedgerEntry[]; total: number }[];
  categories: EntryCategory[];
  mainCurrency: string;
  onView: (entry: LedgerEntry) => void;
  selectionMode?: boolean;
  selectedIds?: readonly string[];
  onToggleSelection?: (id: string) => void;
}

export function LedgerEntryGroupsView({
  groups,
  categories,
  mainCurrency,
  onView,
  selectionMode = false,
  selectedIds = [],
  onToggleSelection,
}: LedgerEntryGroupsViewProps) {
  const locale = useLocale();
  return groups.map((group) => (
    <div key={group.title} className="ledger-list-group space-y-2">
      <EntryGroupHeader
        title={group.title}
        totalLabel={formatCurrencyAmount(group.total, mainCurrency, locale)}
      />
      <div className="space-y-4 px-2">
        {group.items.map((entry) => (
          <LedgerEntryCard
            key={entry.id}
            ledgerEntry={entry}
            categories={categories}
            mainCurrency={mainCurrency}
            onView={onView}
            selectionMode={selectionMode}
            isSelected={selectedIds.includes(entry.id)}
            {...(onToggleSelection == null ? {} : { onToggleSelect: onToggleSelection })}
          />
        ))}
      </div>
    </div>
  ));
}
