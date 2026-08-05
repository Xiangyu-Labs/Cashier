import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui";
import { useLocale } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { EntryGroupHeader } from "./EntryGroupHeader";
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";
import { memo } from "react";

// ---------------------------------------------------------------------------
// Unified Stream Groups (replaces attention section + completed groups)
// ---------------------------------------------------------------------------

export interface UnifiedStreamGroupProps {
  streamGroups: UnifiedStreamGroup[];
  mainCurrency: string;
  onViewLedgerEntry?: (entry: LedgerEntry) => void;
  onViewSourceDetail: (group: {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
  }) => void;
  onEditRetry?: (doc: SourceDocument) => void;
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  isSelectionMode: boolean;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  noRecordsText: string;
  getItemProps: () => Record<string, unknown>;
  timeZone?: string;
  readOnly?: boolean;
  collapseEntriesDefault?: boolean;
  cachedImageUrls?: ReadonlyMap<string, string>;
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
  noRecordsText,
  getItemProps,
  timeZone,
  readOnly = false,
  collapseEntriesDefault = false,
  cachedImageUrls,
}: UnifiedStreamGroupProps) {
  if (streamGroups.length === 0) {
    return (
      <div className="space-y-6 pt-2">
        <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
          <span>{noRecordsText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {streamGroups.map((dateGroup) => (
        <div key={dateGroup.date} className="ledger-list-group space-y-2">
          <UnifiedGroupHeader
            group={dateGroup}
            mainCurrency={mainCurrency}
            {...(timeZone != null ? { timeZone } : {})}
          />

          <div className="space-y-4 px-2">
            {dateGroup.items.map((item) => (
              <UnifiedStreamItemRow
                key={item.sourceDocument.id}
                item={item}
                mainCurrency={mainCurrency}
                {...(onViewLedgerEntry != null ? { onViewLedgerEntry } : {})}
                onViewSourceDetail={onViewSourceDetail}
                {...(onEditRetry != null ? { onEditRetry } : {})}
                onDeleteSourceConfirm={onDeleteSourceConfirm}
                selectionMode={isSelectionMode}
                selected={selectedIds.includes(item.sourceDocument.id)}
                onToggleSelection={onToggleSelection}
                getItemProps={getItemProps}
                readOnly={readOnly}
                defaultExpanded={!collapseEntriesDefault}
                {...(cachedImageUrls != null ? { cachedImageUrls } : {})}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface UnifiedStreamItemRowProps {
  item: UnifiedStreamGroup["items"][number];
  mainCurrency: string;
  onViewLedgerEntry?: (entry: LedgerEntry) => void;
  onViewSourceDetail: UnifiedStreamGroupProps["onViewSourceDetail"];
  onEditRetry?: (doc: SourceDocument) => void;
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelection: (id: string) => void;
  getItemProps: () => Record<string, unknown>;
  readOnly: boolean;
  defaultExpanded: boolean;
  cachedImageUrls?: ReadonlyMap<string, string>;
}

const UnifiedStreamItemRow = memo(function UnifiedStreamItemRow({
  item,
  mainCurrency,
  onViewLedgerEntry,
  onViewSourceDetail,
  onEditRetry,
  onDeleteSourceConfirm,
  selectionMode,
  selected,
  onToggleSelection,
  getItemProps,
  readOnly,
  defaultExpanded,
  cachedImageUrls,
}: UnifiedStreamItemRowProps) {
  const sourceDocument = item.sourceDocument as SourceDocument;
  const ledgerEntries = item.ledgerEntries as LedgerEntry[];

  return (
    <div {...getItemProps()}>
      <SourceDocumentCard
        sourceDocument={item.sourceDocument}
        ledgerEntries={item.ledgerEntries}
        mainCurrency={mainCurrency}
        {...(onViewLedgerEntry != null ? { onViewLedgerEntry } : {})}
        onViewDetails={() => onViewSourceDetail({ sourceDocument, ledgerEntries })}
        {...(onEditRetry != null ? { onEditRetry: () => onEditRetry(sourceDocument) } : {})}
        onDelete={() => onDeleteSourceConfirm(sourceDocument)}
        status={item.sourceDocument.status as SourceDocumentStatusType}
        anomalyReason={item.sourceDocument.anomalyReason}
        selectionMode={selectionMode}
        isSelected={selected}
        onToggleSelect={() => onToggleSelection(sourceDocument.id)}
        readOnly={readOnly}
        defaultExpanded={defaultExpanded}
        {...(cachedImageUrls != null ? { cachedImageUrls } : {})}
      />
    </div>
  );
});

function UnifiedGroupHeader({
  group,
  mainCurrency,
  timeZone,
}: {
  group: UnifiedStreamGroup;
  mainCurrency: string;
  timeZone?: string;
}) {
  const locale = useLocale();
  const t = useGroupHeaderStrings();

  const dateLabel = (() => {
    if (group.dateProvenance === "unknown") return t("dateUnknown");
    if (group.dateProvenance === "submitted") {
      // Format submission date for display
      const d = new Date(group.date + "T00:00:00");
      if (isNaN(d.getTime())) return group.date;
      return formatLocalizedDate(d, locale, t("today"), t("yesterday"), timeZone);
    }
    const d = new Date(group.date + "T00:00:00");
    if (isNaN(d.getTime())) return group.date;
    return formatLocalizedDate(d, locale, t("today"), t("yesterday"), timeZone);
  })();

  const provenanceNote =
    group.dateProvenance === "submitted"
      ? t("submittedGroupSuffix")
      : group.dateProvenance === "unknown"
        ? ""
        : "";

  return (
    <EntryGroupHeader
      title={dateLabel}
      {...(provenanceNote !== "" ? { subtitle: provenanceNote } : {})}
      totalLabel={formatCurrencyAmount(group.total, mainCurrency, locale)}
    />
  );
}

function formatLocalizedDate(
  date: Date,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
  timeZone?: string
) {
  const toLocalKey = (value: Date) =>
    [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  const value = toLocalKey(date);
  const zonedToday = getDateInTimezone(timeZone);
  const today = zonedToday != null ? parseDateString(zonedToday) : new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (value === toLocalKey(today)) return todayLabel;
  if (value === toLocalKey(yesterday)) return yesterdayLabel;
  return date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" });
}

// Inline translations to avoid hook ordering issues when composited with mobile/narrow layouts
import { useTranslations } from "next-intl";

function useGroupHeaderStrings() {
  const t = useTranslations("SourceDocumentCard");
  return t;
}
