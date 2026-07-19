import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { AnimatePresence, motion } from "framer-motion";
import type { SourceDocumentGroupDto as SourceDocumentGroup } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui";
import type {
  UnifiedStreamGroup,
} from "@/modules/source-document/stream-grouping";

export interface GroupedCompletedDateGroup {
  title: string;
  total: number;
  items: SourceDocumentGroup[];
}

interface LedgerEntriesCompletedGroupsProps {
  groupedCompletedByDate: GroupedCompletedDateGroup[];
  mainCurrency: string;
  onViewLedgerEntry: (entry: LedgerEntry) => void;
  onViewSourceDetail: (group: {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
  }) => void;
  onRetry: (doc: SourceDocument) => void;
  onDirectRetry?: (doc: SourceDocument) => void;
  onEditRetry?: (doc: SourceDocument) => void;
  onAcceptCandidate?: (doc: SourceDocument) => void;
  onAbandonCandidate?: (doc: SourceDocument) => void;
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  isSelectionMode: boolean;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  collapseEntriesDefault: boolean;
  noRecordsText: string;
  getItemProps: () => Record<string, unknown>;
}

export function LedgerEntriesCompletedGroups({
  groupedCompletedByDate,
  mainCurrency,
  onViewLedgerEntry,
  onViewSourceDetail,
  onRetry,
  onDirectRetry,
  onEditRetry,
  onAcceptCandidate,
  onAbandonCandidate,
  onDeleteSourceConfirm,
  isSelectionMode,
  selectedIds,
  onToggleSelection,
  collapseEntriesDefault,
  noRecordsText,
  getItemProps,
}: LedgerEntriesCompletedGroupsProps) {
  if (groupedCompletedByDate.length === 0) {
    return (
      <div className="space-y-6 px-2 pt-2">
        <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
          <span>{noRecordsText}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 px-2 pt-2">
        <AnimatePresence mode="popLayout">
          {groupedCompletedByDate.map((dateGroup) => (
            <motion.div
              key={dateGroup.title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <div className="py-2 px-2 flex items-center justify-between">
                <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                  {dateGroup.title}
                </h3>
                <span className="text-[10px] sm:text-xs font-mono font-medium text-muted-foreground">
                  {mainCurrency} {dateGroup.total.toFixed(2)}
                </span>
              </div>

              <div className="space-y-4">
                {dateGroup.items.map((group) => (
                  <motion.div
                    key={group.sourceDocument.id}
                    layout
                    layoutId={group.sourceDocument.id}
                    {...getItemProps()}
                  >
                    <SourceDocumentCard
                      sourceDocument={group.sourceDocument}
                      ledgerEntries={group.ledgerEntries}
                      mainCurrency={mainCurrency}
                      onViewLedgerEntry={onViewLedgerEntry}
                      onViewDetails={() => onViewSourceDetail(group)}
                      onRetry={() => onRetry(group.sourceDocument)}
                      {...(onDirectRetry != null ? { onDirectRetry: () => { onDirectRetry(group.sourceDocument); } } : {})}
                      {...(onEditRetry != null ? { onEditRetry: () => { onEditRetry(group.sourceDocument); } } : {})}
                      {...(onAcceptCandidate != null ? { onAcceptCandidate: () => { onAcceptCandidate(group.sourceDocument); } } : {})}
                      {...(onAbandonCandidate != null ? { onAbandonCandidate: () => { onAbandonCandidate(group.sourceDocument); } } : {})}
                      onDelete={() => onDeleteSourceConfirm(group.sourceDocument)}
                      status={
                        (group.sourceDocument.status ?? "completed") as SourceDocumentStatusType
                      }
                      anomalyReason={group.sourceDocument.anomalyReason}
                      selectionMode={isSelectionMode}
                      isSelected={selectedIds.includes(group.sourceDocument.id)}
                      onToggleSelect={() => onToggleSelection(group.sourceDocument.id)}
                      defaultExpanded={!collapseEntriesDefault}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

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
  onRetry: (doc: SourceDocument) => void;
  onDirectRetry?: (doc: SourceDocument) => void;
  onEditRetry?: (doc: SourceDocument) => void;
  onAcceptCandidate?: (doc: SourceDocument) => void;
  onAbandonCandidate?: (doc: SourceDocument) => void;
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  isSelectionMode: boolean;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  collapseEntriesDefault: boolean;
  noRecordsText: string;
  getItemProps: () => Record<string, unknown>;
  /** Pending state for recovery mutations. */
  isRetrying?: boolean;
  isAccepting?: boolean;
  isAbandoning?: boolean;
}

export function LedgerEntriesUnifiedGroups({
  streamGroups,
  mainCurrency,
  onViewLedgerEntry,
  onViewSourceDetail,
  onRetry,
  onDirectRetry,
  onEditRetry,
  onAcceptCandidate,
  onAbandonCandidate,
  onDeleteSourceConfirm,
  isSelectionMode,
  selectedIds,
  onToggleSelection,
  collapseEntriesDefault,
  noRecordsText,
  getItemProps,
  isRetrying = false,
  isAccepting = false,
  isAbandoning = false,
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
      <AnimatePresence mode="popLayout">
        {streamGroups.map((dateGroup) => (
          <motion.div
            key={dateGroup.date}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <UnifiedGroupHeader
              group={dateGroup}
              mainCurrency={mainCurrency}
            />

            <div className="space-y-4">
              {dateGroup.items.map((item) => (
                <motion.div
                  key={item.sourceDocument.id}
                  layout
                  layoutId={item.sourceDocument.id}
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
                    onRetry={() => onRetry(item.sourceDocument as SourceDocument)}
                    {...(onDirectRetry != null
                      ? {
                          onDirectRetry: () => {
                            onDirectRetry(item.sourceDocument as SourceDocument);
                          },
                        }
                      : {})}
                    {...(onEditRetry != null
                      ? {
                          onEditRetry: () => {
                            onEditRetry(item.sourceDocument as SourceDocument);
                          },
                        }
                      : {})}
                    {...(onAcceptCandidate != null
                      ? {
                          onAcceptCandidate: () => {
                            onAcceptCandidate(item.sourceDocument as SourceDocument);
                          },
                        }
                      : {})}
                    {...(onAbandonCandidate != null
                      ? {
                          onAbandonCandidate: () => {
                            onAbandonCandidate(item.sourceDocument as SourceDocument);
                          },
                        }
                      : {})}
                    onDelete={() =>
                      onDeleteSourceConfirm(item.sourceDocument as SourceDocument)
                    }
                    status={
                      item.sourceDocument.status as SourceDocumentStatusType
                    }
                    anomalyReason={item.sourceDocument.anomalyReason}
                    selectionMode={isSelectionMode}
                    isSelected={selectedIds.includes(item.sourceDocument.id)}
                    onToggleSelect={() =>
                      onToggleSelection(item.sourceDocument.id)
                    }
                    defaultExpanded={!collapseEntriesDefault}
                    dateProvenance={item.dateProvenance}
                    candidateComparison={
                      item.sourceDocument.candidateComparison ?? null
                    }
                    isMutationPending={
                      isRetrying ||
                      isAccepting ||
                      isAbandoning
                    }
                    isAccepting={isAccepting}
                    isAbandoning={isAbandoning}
                  />
                </motion.div>
              ))}
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
}: {
  group: UnifiedStreamGroup;
  mainCurrency: string;
}) {
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
        {mainCurrency} {group.total.toFixed(2)}
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
