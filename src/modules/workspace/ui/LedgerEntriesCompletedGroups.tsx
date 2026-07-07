import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { AnimatePresence, motion } from "framer-motion";
import type { SourceDocumentGroupDto as SourceDocumentGroup } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui";

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
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  isSelectionMode: boolean;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  collapseEntriesDefault: boolean;
  noRecordsText: string;
  noMoreText: string;
  getItemProps: () => Record<string, unknown>;
}

export function LedgerEntriesCompletedGroups({
  groupedCompletedByDate,
  mainCurrency,
  onViewLedgerEntry,
  onViewSourceDetail,
  onRetry,
  onDeleteSourceConfirm,
  isSelectionMode,
  selectedIds,
  onToggleSelection,
  collapseEntriesDefault,
  noRecordsText,
  noMoreText,
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

      <div className="flex justify-center py-4">
        <span className="text-xs text-muted-foreground/50">- {noMoreText} -</span>
      </div>
    </>
  );
}
