import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui";
import { useLocale } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";

// ---------------------------------------------------------------------------
// Unified Stream Groups (replaces attention section + completed groups)
// ---------------------------------------------------------------------------

export interface UnifiedStreamGroupProps {
  streamGroups: UnifiedStreamGroup[];
  mainCurrency: string;
  onViewLedgerEntry: (entry: LedgerEntry) => void;
  onViewSourceDetail: (group: {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
  }) => void;
  onEditRetry?: (doc: SourceDocument) => void;
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  isSelectionMode: boolean;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  collapseEntriesDefault: boolean;
  noRecordsText: string;
  getItemProps: () => Record<string, unknown>;
}

export function LedgerEntriesUnifiedGroups({
  streamGroups,
  mainCurrency,
  onViewLedgerEntry,
  onViewSourceDetail,
  onEditRetry,
  onDeleteSourceConfirm,
  isSelectionMode,
  selectedIds,
  onToggleSelection,
  collapseEntriesDefault,
  noRecordsText,
  getItemProps,
}: UnifiedStreamGroupProps) {
  if (streamGroups.length === 0) {
    return (
      <div className="space-y-6 px-2 pt-2">
        <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
          <span>{noRecordsText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-2 pt-2">
      {streamGroups.map((dateGroup) => (
        <div key={dateGroup.date} className="space-y-2 animate-fade-in">
          <UnifiedGroupHeader group={dateGroup} mainCurrency={mainCurrency} />

          <div className="space-y-4">
            {dateGroup.items.map((item) => (
              <div key={item.sourceDocument.id} {...getItemProps()}>
                <SourceDocumentCard
                  sourceDocument={item.sourceDocument}
                  ledgerEntries={item.ledgerEntries}
                  mainCurrency={mainCurrency}
                  onViewLedgerEntry={onViewLedgerEntry}
                  onViewDetails={() =>
                    onViewSourceDetail({
                      sourceDocument: item.sourceDocument as SourceDocument,
                      ledgerEntries: item.ledgerEntries as LedgerEntry[],
                    })
                  }
                  {...(onEditRetry != null
                    ? {
                        onEditRetry: () => {
                          onEditRetry(item.sourceDocument as SourceDocument);
                        },
                      }
                    : {})}
                  onDelete={() => onDeleteSourceConfirm(item.sourceDocument as SourceDocument)}
                  status={item.sourceDocument.status as SourceDocumentStatusType}
                  anomalyReason={item.sourceDocument.anomalyReason}
                  selectionMode={isSelectionMode}
                  isSelected={selectedIds.includes(item.sourceDocument.id)}
                  onToggleSelect={() => onToggleSelection(item.sourceDocument.id)}
                  defaultExpanded={!collapseEntriesDefault}
                  dateProvenance={item.dateProvenance}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UnifiedGroupHeader({
  group,
  mainCurrency,
}: {
  group: UnifiedStreamGroup;
  mainCurrency: string;
}) {
  const locale = useLocale();
  const t = useGroupHeaderStrings();

  const dateLabel = (() => {
    if (group.dateProvenance === "unknown") return t("dateUnknown");
    if (group.dateProvenance === "submitted") {
      // Format submission date for display
      const d = new Date(group.date + "T00:00:00");
      if (isNaN(d.getTime())) return group.date;
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
    const d = new Date(group.date + "T00:00:00");
    if (isNaN(d.getTime())) return group.date;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  })();

  const provenanceNote =
    group.dateProvenance === "submitted"
      ? ` ${t("submittedGroupSuffix")}`
      : group.dateProvenance === "unknown"
        ? ""
        : "";

  return (
    <div className="py-2 px-2 flex items-center justify-between">
      <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
        {dateLabel}
        {provenanceNote && (
          <span className="text-[9px] sm:text-[10px] text-muted-foreground/60 italic ml-1">
            {provenanceNote}
          </span>
        )}
      </h3>
      <span className="text-[10px] sm:text-xs font-mono font-medium text-muted-foreground">
        {formatCurrencyAmount(group.total, mainCurrency, locale)}
      </span>
    </div>
  );
}

// Inline translations to avoid hook ordering issues when composited with mobile/narrow layouts
import { useTranslations } from "next-intl";

function useGroupHeaderStrings() {
  const t = useTranslations("SourceDocumentCard");
  return t;
}
