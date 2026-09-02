"use client";
import { memo } from "react";
import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";
import { Card } from "@/components/ui/card";
import { SelectableCardSurface } from "@/components/selectable-card-surface";
import { cn } from "@/lib/utils";
import { EditableLedgerEntryItem } from "../../EditableLedgerEntryItem";
import type { EntryEditData } from "@/modules/source-document/types";

interface SelectableEditableEntryCardProps {
  entry: LedgerEntry;
  categories: EntryCategory[];
  categoryPlaceholder: string;
  preferredCurrencies: string[];
  mainCurrency: string;
  selectionMode: boolean;
  selected: boolean;
  selectionLabel: string;
  onEntryChange: (entryId: string, changes: Partial<EntryEditData>) => void;
  onSelectEntry: (entryId: string, selected: boolean) => void;
  sourceDocumentEntryDate: string;
  originalEntryDate: string;
  readOnly: boolean;
  onDelete?: (() => void) | undefined;
  pendingChanges?: Partial<EntryEditData>;
}

export const SelectableEditableEntryCard = memo(function SelectableEditableEntryCard({
  entry,
  categories,
  categoryPlaceholder,
  preferredCurrencies,
  mainCurrency,
  selectionMode,
  selected,
  selectionLabel,
  onEntryChange,
  onSelectEntry,
  sourceDocumentEntryDate,
  originalEntryDate,
  readOnly,
  onDelete,
  pendingChanges,
}: SelectableEditableEntryCardProps) {
  return (
    <SelectableCardSurface
      selectionMode={selectionMode}
      selected={selected}
      selectionLabel={selectionLabel}
      onToggleSelection={() => onSelectEntry(entry.id, !selected)}
      indicatorPlacement="top"
    >
      <Card
        className={cn(
          "overflow-hidden",
          selectionMode && selected && "border-primary bg-primary/5"
        )}
      >
        <EditableLedgerEntryItem
          ledgerEntry={entry}
          categories={categories}
          categoryPlaceholder={categoryPlaceholder}
          preferredCurrencies={preferredCurrencies}
          mainCurrency={mainCurrency}
          className={cn(selectionMode && "pl-11")}
          onChange={(changes) => onEntryChange(entry.id, changes)}
          sourceDocumentEntryDate={sourceDocumentEntryDate}
          originalEntryDate={originalEntryDate}
          readOnly={readOnly}
          onDelete={onDelete}
          {...(pendingChanges !== undefined ? { pendingChanges } : {})}
        />
      </Card>
    </SelectableCardSurface>
  );
});
