"use client";
import type { LedgerEntryEmbeddedViewDto, EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { type ReactNode, useMemo, memo } from "react";
import Decimal from "decimal.js";
import type { EntryEditData } from "@/modules/source-document/types";
import { buildSourceDocumentDetailViewModel } from "./source-document-detail-view-model";
import { SourceDocumentSummaryHeader } from "./SourceDocumentViewDetails/components/SourceDocumentSummaryHeader";
import { SourceDocumentEntriesList } from "./SourceDocumentViewDetails/components/SourceDocumentEntriesList";
import { SourceDocumentRawEvidence } from "./SourceDocumentViewDetails/components/SourceDocumentRawEvidence";
import type { PendingChanges, SourceDocPendingChanges } from "./source-document-view-details-types";

interface SourceDocumentViewDetailsProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  // These entries are always the embedded, sourceDocument-less view (see
  // listLedgerEntryViewsBySourceDocumentIds); typing this as the wider
  // LedgerEntry would let `.sourceDocument` type-check while silently
  // reading undefined at runtime.
  ledgerEntries: LedgerEntryEmbeddedViewDto[];
  categories: EntryCategory[];
  preferredCurrencies?: string[];
  mainCurrency?: string;
  pendingChanges: PendingChanges;
  selectedEntryIds: string[];
  isSelectionMode: boolean;
  isLoadingImages?: boolean;
  onSourceDocChange: (changes: SourceDocPendingChanges) => void;
  onEntryChange: (entryId: string, changes: Partial<EntryEditData>) => void;
  onSelectEntry: (entryId: string, selected: boolean) => void;
  onSelectAllEntries: (selected: boolean) => void;
  onToggleSelectionMode: () => void;
  readOnly?: boolean;
  /** When true the entry/date fields are editable. Independent of `readOnly` so
   * batch selection and image browsing stay available in read mode. */
  isEditMode?: boolean;
  /** Opens the add-entry dialog; the "add entry" button only shows in edit mode. */
  onAddEntry?: () => void;
  /** Deletes a single entry; the per-entry delete button only shows in edit mode. */
  onDeleteEntry?: (entryId: string) => void;
  cachedImageUrls?: ReadonlyMap<string, string>;
}

export const SourceDocumentViewDetails = memo(function SourceDocumentViewDetails({
  sourceDocument,
  ledgerEntries,
  categories,
  preferredCurrencies = [],
  mainCurrency = "CNY",
  pendingChanges,
  selectedEntryIds,
  isSelectionMode,
  isLoadingImages = false,
  onSourceDocChange,
  onEntryChange,
  onSelectEntry,
  onSelectAllEntries: _onSelectAllEntries,
  onToggleSelectionMode,
  readOnly = false,
  isEditMode = false,
  onAddEntry,
  onDeleteEntry,
  cachedImageUrls,
}: SourceDocumentViewDetailsProps): ReactNode {
  const displayEntryDate = pendingChanges.sourceDoc.entryDate ?? sourceDocument.entryDate ?? "";
  // Entry/date fields are editable only while in edit mode (and never during a mutation).
  const fieldsDisabled = readOnly || !isEditMode;

  const {
    displayEntries,
    subtotalsByCurrency,
    totalInMainCurrency,
    unconvertedCount,
    staleConversionCount,
  } = useMemo(
    () =>
      buildSourceDocumentDetailViewModel({
        ledgerEntries,
        pendingChanges,
        mainCurrency,
        entryDate: displayEntryDate,
        originalEntryDate: sourceDocument.entryDate ?? "",
      }),
    [displayEntryDate, ledgerEntries, mainCurrency, pendingChanges, sourceDocument.entryDate]
  );

  const uniqueCurrencies = Object.keys(subtotalsByCurrency);
  const displayEntriesById = useMemo(
    () => new Map(displayEntries.map((entry) => [entry.id, entry])),
    [displayEntries]
  );

  const sortedEntries = useMemo(() => {
    return [...ledgerEntries].sort((a, b) => {
      const aOrder = a.category?.sortOrder ?? 999999;
      const bOrder = b.category?.sortOrder ?? 999999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Decimal(displayEntriesById.get(b.id)?.amount ?? b.amount).cmp(
        displayEntriesById.get(a.id)?.amount ?? a.amount
      );
    });
  }, [displayEntriesById, ledgerEntries]);

  const isAnomaly = sourceDocument.status === "anomaly";

  return (
    <div className="h-full flex flex-col gap-4">
      <SourceDocumentSummaryHeader
        displayEntryDate={displayEntryDate}
        onSourceDocChange={onSourceDocChange}
        fieldsDisabled={fieldsDisabled}
        isAnomaly={isAnomaly}
        createdAt={sourceDocument.createdAt}
        totalInMainCurrency={totalInMainCurrency}
        mainCurrency={mainCurrency}
        staleConversionCount={staleConversionCount}
        unconvertedCount={unconvertedCount}
        uniqueCurrencies={uniqueCurrencies}
        subtotalsByCurrency={subtotalsByCurrency}
        displayEntries={displayEntries}
      />

      <SourceDocumentEntriesList
        entries={sortedEntries}
        categories={categories}
        preferredCurrencies={preferredCurrencies}
        mainCurrency={mainCurrency}
        selectedEntryIds={selectedEntryIds}
        isSelectionMode={isSelectionMode}
        readOnly={readOnly}
        fieldsDisabled={fieldsDisabled}
        isEditMode={isEditMode}
        onToggleSelectionMode={onToggleSelectionMode}
        onEntryChange={onEntryChange}
        onSelectEntry={onSelectEntry}
        displayEntryDate={displayEntryDate}
        originalEntryDate={sourceDocument.entryDate ?? ""}
        onAddEntry={onAddEntry}
        onDeleteEntry={onDeleteEntry}
        pendingChanges={pendingChanges.entries}
      />

      <SourceDocumentRawEvidence
        sourceDocument={sourceDocument}
        readOnly={readOnly}
        isLoadingImages={isLoadingImages}
        cachedImageUrls={cachedImageUrls}
      />
    </div>
  );
});
