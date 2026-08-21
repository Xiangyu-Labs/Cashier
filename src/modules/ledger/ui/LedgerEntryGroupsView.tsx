"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLocale } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { EntryGroupHeader } from "@/components/EntryGroupHeader";
import { LedgerEntryCard } from "./LedgerEntryCard";

interface LedgerEntryGroupsViewProps {
  groups: readonly { title: string; items: LedgerEntry[]; total: number }[];
  mainCurrency: string;
  onView: (entry: LedgerEntry) => void;
  selectionMode?: boolean;
  selectedIds?: readonly string[];
  onToggleSelection?: (id: string) => void;
}

type LedgerEntryGroupRow =
  | { key: string; kind: "header"; title: string; total: number }
  | { key: string; kind: "entry"; entry: LedgerEntry };

const VIRTUALIZATION_THRESHOLD = 40;

export function flattenLedgerEntryGroups(
  groups: LedgerEntryGroupsViewProps["groups"]
): LedgerEntryGroupRow[] {
  return groups.flatMap((group, groupIndex) => [
    {
      key: `header:${groupIndex}:${group.title}`,
      kind: "header" as const,
      title: group.title,
      total: group.total,
    },
    ...group.items.map((entry) => ({ key: `entry:${entry.id}`, kind: "entry" as const, entry })),
  ]);
}

export function LedgerEntryGroupsView({
  groups,
  mainCurrency,
  onView,
  selectionMode = false,
  selectedIds = [],
  onToggleSelection,
}: LedgerEntryGroupsViewProps) {
  const locale = useLocale();
  const rows = useMemo(() => flattenLedgerEntryGroups(groups), [groups]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const shouldVirtualize = rows.length > VIRTUALIZATION_THRESHOLD;
  useLayoutEffect(() => {
    if (!shouldVirtualize) return;
    const update = () => {
      const top = listRef.current?.getBoundingClientRect().top;
      if (top != null) setScrollMargin(top + window.scrollY);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [shouldVirtualize]);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    enabled: shouldVirtualize,
    estimateSize: (index) => (rows[index]?.kind === "header" ? 48 : 88),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 8,
    scrollMargin,
  });

  const renderRow = (row: LedgerEntryGroupRow) =>
    row.kind === "header" ? (
      <EntryGroupHeader
        title={row.title}
        totalLabel={formatCurrencyAmount(row.total, mainCurrency, locale)}
      />
    ) : (
      <div className="px-2 pb-4">
        <LedgerEntryCard
          ledgerEntry={row.entry}
          mainCurrency={mainCurrency}
          onView={onView}
          selectionMode={selectionMode}
          isSelected={selectedIdSet.has(row.entry.id)}
          {...(onToggleSelection == null ? {} : { onToggleSelect: onToggleSelection })}
        />
      </div>
    );

  if (!shouldVirtualize) {
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
              mainCurrency={mainCurrency}
              onView={onView}
              selectionMode={selectionMode}
              isSelected={selectedIdSet.has(entry.id)}
              {...(onToggleSelection == null ? {} : { onToggleSelect: onToggleSelection })}
            />
          ))}
        </div>
      </div>
    ));
  }

  return (
    <div
      ref={listRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
      data-testid="virtualized-ledger-entry-list"
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (row == null) return null;
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
          >
            {renderRow(row)}
          </div>
        );
      })}
    </div>
  );
}
