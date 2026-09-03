"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CheckSquare, Plus, X } from "lucide-react";
import type { EntryCategory, LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
import type { EntryEditData } from "@/modules/source-document/types";
import type { EntriesPendingChanges } from "../../source-document-view-details-types";
import { SelectableEditableEntryCard } from "./SelectableEditableEntryCard";

interface SourceDocumentEntriesListProps {
  entries: LedgerEntryEmbeddedViewDto[];
  categories: EntryCategory[];
  preferredCurrencies: string[];
  mainCurrency: string;
  selectedEntryIds: string[];
  isSelectionMode: boolean;
  interactionDisabled: boolean;
  fieldsDisabled: boolean;
  isEditMode: boolean;
  onToggleSelectionMode: () => void;
  onEntryChange: (entryId: string, changes: Partial<EntryEditData>) => void;
  onSelectEntry: (entryId: string, selected: boolean) => void;
  displayEntryDate: string;
  originalEntryDate: string;
  onAddEntry?: (() => void) | undefined;
  onDeleteEntry?: ((entryId: string) => void) | undefined;
  pendingChanges: EntriesPendingChanges;
}

export function SourceDocumentEntriesList({
  entries,
  categories,
  preferredCurrencies,
  mainCurrency,
  selectedEntryIds,
  isSelectionMode,
  interactionDisabled,
  fieldsDisabled,
  isEditMode,
  onToggleSelectionMode,
  onEntryChange,
  onSelectEntry,
  displayEntryDate,
  originalEntryDate,
  onAddEntry,
  onDeleteEntry,
  pendingChanges,
}: SourceDocumentEntriesListProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          {entries.length > 0 && !interactionDisabled && (
            <Button
              variant={isSelectionMode ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleSelectionMode}
              className="shrink-0 h-8 w-8"
              title={isSelectionMode ? t("cancelSelect") : t("select")}
            >
              {isSelectionMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
            </Button>
          )}
          <span className="text-xs font-semibold text-muted-foreground">
            {t("entries")} ({entries.length})
          </span>
        </div>
      </div>

      <div className="space-y-2 pb-2">
        {entries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 md:p-12 text-center border border-dashed border-border/80 rounded-2xl bg-surface2/5">
            <p className="text-muted-foreground text-sm font-medium">{t("noEntries")}</p>
          </div>
        ) : (
          entries.map((entry) => (
            <SelectableEditableEntryCard
              key={entry.id}
              entry={entry}
              categories={categories}
              categoryPlaceholder={t("selectCategory")}
              preferredCurrencies={preferredCurrencies}
              mainCurrency={mainCurrency}
              selectionMode={isSelectionMode}
              selected={selectedEntryIds.includes(entry.id)}
              selectionLabel={tCommon("selectItem", { item: entry.itemName })}
              onEntryChange={onEntryChange}
              onSelectEntry={onSelectEntry}
              sourceDocumentEntryDate={displayEntryDate}
              originalEntryDate={originalEntryDate}
              readOnly={fieldsDisabled}
              onDelete={
                !interactionDisabled && isEditMode && onDeleteEntry != null
                  ? () => onDeleteEntry(entry.id)
                  : undefined
              }
              {...(pendingChanges[entry.id] !== undefined
                ? { pendingChanges: pendingChanges[entry.id] }
                : {})}
            />
          ))
        )}
        {!interactionDisabled && isEditMode && onAddEntry != null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 border-dashed"
            onClick={onAddEntry}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addEntryTitle")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
