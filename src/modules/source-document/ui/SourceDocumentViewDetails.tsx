"use client";
import type { LedgerEntryEmbeddedViewDto, EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { type ReactNode, useMemo, memo } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EntryEditData } from "@/modules/source-document/types";
import { buildSourceDocumentDetailViewModel } from "./source-document-detail-view-model";
import { SourceDocumentSummaryHeader } from "./SourceDocumentViewDetails/components/SourceDocumentSummaryHeader";
import { SourceDocumentEntriesList } from "./SourceDocumentViewDetails/components/SourceDocumentEntriesList";
import { SourceDocumentTotal } from "./SourceDocumentViewDetails/components/SourceDocumentTotal";
import { SourceDocumentRawEvidence } from "./SourceDocumentViewDetails/components/SourceDocumentRawEvidence";
import type {
  PendingChanges,
  SourceDocPendingChanges,
} from "@/modules/source-document/detail-types";
import { SourceDocumentDateOrganization } from "./SourceDocumentDateOrganization";
import type { ApplyDateOrganizationInput } from "../contracts";

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
  onToggleSelectionMode: () => void;
  interactionDisabled?: boolean;
  /** When true the entry/date fields are editable. */
  isEditMode?: boolean;
  /** Opens the add-entry dialog; the "add entry" button only shows in edit mode. */
  onAddEntry?: () => void;
  /** Deletes a single entry; the per-entry delete button only shows in edit mode. */
  onDeleteEntry?: (entryId: string) => void;
  onRequestEdit?: () => void;
  onApplyDateOrganization?: (
    input: Omit<ApplyDateOrganizationInput, "sourceDocumentId" | "expectedVersion">
  ) => Promise<unknown>;
  onDismissDateOrganization?: (suggestionId: string) => Promise<unknown>;
  isOrganizingDates?: boolean;
  dateOrganizationDisabled?: boolean;
  onDateAdjustmentStateChange?: (active: boolean, dirty: boolean) => void;
  /**
   * Which pane the narrow-viewport layout shows. The footer owns the toggle
   * because the "view evidence" button sits in the action bar; desktop always
   * shows both panes.
   */
  mobileView: "details" | "evidence";
  onMobileViewChange: (view: "details" | "evidence") => void;
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
  onToggleSelectionMode,
  interactionDisabled = false,
  isEditMode = false,
  onAddEntry,
  onDeleteEntry,
  onRequestEdit,
  onApplyDateOrganization,
  onDismissDateOrganization,
  isOrganizingDates = false,
  dateOrganizationDisabled = false,
  onDateAdjustmentStateChange,
  mobileView,
  onMobileViewChange,
}: SourceDocumentViewDetailsProps): ReactNode {
  const t = useTranslations("SourceDocumentDetail");
  const displayEntryDate = pendingChanges.sourceDoc.entryDate ?? sourceDocument.documentDate ?? "";
  // Entry/date fields are editable only while in edit mode (and never during a mutation).
  const fieldsDisabled = interactionDisabled || !isEditMode;

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
        originalEntryDate: sourceDocument.documentDate ?? "",
      }),
    [displayEntryDate, ledgerEntries, mainCurrency, pendingChanges, sourceDocument.documentDate]
  );

  const uniqueCurrencies = Object.keys(subtotalsByCurrency);
  const isInvalid =
    sourceDocument.processingStatus === "failed" && sourceDocument.failureKind === "invalid_input";

  return (
    <div className="grid min-h-0 gap-4 lg:h-full lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
      <div
        data-testid="source-document-details-pane"
        className={cn(
          "min-w-0 space-y-4 overflow-y-auto lg:min-h-0 lg:pr-1",
          mobileView === "evidence" && "hidden lg:block"
        )}
      >
        <SourceDocumentSummaryHeader
          displayEntryDate={displayEntryDate}
          onSourceDocChange={onSourceDocChange}
          fieldsDisabled={fieldsDisabled}
          isInvalid={isInvalid}
        />

        {sourceDocument.dateOrganizationSuggestion != null &&
        onApplyDateOrganization != null &&
        onDismissDateOrganization != null ? (
          <SourceDocumentDateOrganization
            key={sourceDocument.dateOrganizationSuggestion.id}
            suggestion={sourceDocument.dateOrganizationSuggestion}
            entries={ledgerEntries}
            disabled={interactionDisabled || isOrganizingDates || dateOrganizationDisabled}
            onApply={onApplyDateOrganization}
            onDismiss={onDismissDateOrganization}
            {...(onDateAdjustmentStateChange == null
              ? {}
              : { onAdjustmentStateChange: onDateAdjustmentStateChange })}
          />
        ) : null}

        <SourceDocumentEntriesList
          entries={ledgerEntries}
          categories={categories}
          preferredCurrencies={preferredCurrencies}
          mainCurrency={mainCurrency}
          selectedEntryIds={selectedEntryIds}
          isSelectionMode={isSelectionMode}
          interactionDisabled={interactionDisabled}
          fieldsDisabled={fieldsDisabled}
          isEditMode={isEditMode}
          onToggleSelectionMode={onToggleSelectionMode}
          onEntryChange={onEntryChange}
          onSelectEntry={onSelectEntry}
          displayEntryDate={displayEntryDate}
          originalEntryDate={sourceDocument.documentDate ?? ""}
          onAddEntry={onAddEntry}
          onDeleteEntry={onDeleteEntry}
          pendingChanges={pendingChanges.entries}
          {...(onRequestEdit == null ? {} : { onRequestEdit })}
          headerEnd={
            <SourceDocumentTotal
              totalInMainCurrency={totalInMainCurrency}
              mainCurrency={mainCurrency}
              staleConversionCount={staleConversionCount}
              unconvertedCount={unconvertedCount}
              uniqueCurrencies={uniqueCurrencies}
              subtotalsByCurrency={subtotalsByCurrency}
              displayEntries={displayEntries}
            />
          }
        />
      </div>
      <aside
        className={cn(
          "min-w-0 overflow-y-auto border-t pt-4 lg:min-h-0 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0",
          mobileView === "details" && "hidden lg:block"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-3 lg:hidden"
          onClick={() => onMobileViewChange("details")}
        >
          <ArrowLeft className="size-4" />
          {t("backToDetails")}
        </Button>
        <SourceDocumentRawEvidence
          sourceDocument={sourceDocument}
          isLoadingImages={isLoadingImages}
        />
      </aside>
    </div>
  );
});
