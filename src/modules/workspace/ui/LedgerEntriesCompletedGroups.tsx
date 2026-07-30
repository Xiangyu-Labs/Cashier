import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui";
import { useLocale } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { AnimatePresence, motion } from "framer-motion";
import { EntryGroupHeader } from "./EntryGroupHeader";
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";

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
  timeZone?: string;
  readOnly?: boolean;
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
  timeZone,
  readOnly = false,
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
      <AnimatePresence initial={false} mode="popLayout">
        {streamGroups.map((dateGroup) => (
          <motion.div
            key={dateGroup.date}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="space-y-2"
          >
            <UnifiedGroupHeader
              group={dateGroup}
              mainCurrency={mainCurrency}
              {...(timeZone != null ? { timeZone } : {})}
            />

            <div className="space-y-4">
              <AnimatePresence initial={false} mode="popLayout">
                {dateGroup.items.map((item) => (
                  <motion.div
                    key={item.sourceDocument.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    {...getItemProps()}
                  >
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
                      readOnly={readOnly}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

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
