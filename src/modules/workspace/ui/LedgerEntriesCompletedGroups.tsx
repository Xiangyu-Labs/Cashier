import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui";
import { useLocale } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { EntryGroupHeader } from "./EntryGroupHeader";
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStreamListMotion, type StreamListMotionApi } from "./use-stream-list-motion";

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

  const commonProps = {
    streamGroups,
    mainCurrency,
    ...(onViewLedgerEntry != null ? { onViewLedgerEntry } : {}),
    onViewSourceDetail,
    ...(onEditRetry != null ? { onEditRetry } : {}),
    onDeleteSourceConfirm,
    isSelectionMode,
    selectedIds,
    onToggleSelection,
    noRecordsText,
    getItemProps,
    ...(timeZone != null ? { timeZone } : {}),
    collapseEntriesDefault,
  } satisfies Omit<UnifiedStreamGroupProps, "readOnly">;

  if (readOnly) {
    return <StaticUnifiedGroups {...commonProps} readOnly />;
  }
  return <InteractiveUnifiedGroups {...commonProps} />;
}

/**
 * Static (startup snapshot) rendering: keeps the per-group `content-visibility`
 * optimization and renders no list motion — the snapshot never changes.
 */
function StaticUnifiedGroups(props: UnifiedStreamGroupProps) {
  return (
    <div className="space-y-6 pt-2">
      {props.streamGroups.map((dateGroup) => (
        <div key={dateGroup.date} className="ledger-list-group space-y-2">
          <UnifiedGroupHeader
            group={dateGroup}
            mainCurrency={props.mainCurrency}
            {...(props.timeZone != null ? { timeZone: props.timeZone } : {})}
          />

          <div className="space-y-4 px-2">
            {dateGroup.items.map((item) => (
              <UnifiedStreamItemRow
                key={item.sourceDocument.id}
                item={item}
                mainCurrency={props.mainCurrency}
                {...(props.onViewLedgerEntry != null
                  ? { onViewLedgerEntry: props.onViewLedgerEntry }
                  : {})}
                onViewSourceDetail={props.onViewSourceDetail}
                {...(props.onEditRetry != null ? { onEditRetry: props.onEditRetry } : {})}
                onDeleteSourceConfirm={props.onDeleteSourceConfirm}
                selectionMode={props.isSelectionMode}
                selected={props.selectedIds.includes(item.sourceDocument.id)}
                onToggleSelection={props.onToggleSelection}
                getItemProps={props.getItemProps}
                readOnly={props.readOnly === true}
                defaultExpanded={!props.collapseEntriesDefault}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Interactive stream rendering: one flat keyed list so cards keep their DOM
 * node (and expansion state) across date-group moves, wrapped in the
 * transform/opacity motion layer. No `content-visibility` here — it would
 * fight the animations and rect measurements.
 */
function InteractiveUnifiedGroups(props: UnifiedStreamGroupProps) {
  const motionItems = useMemo(
    () =>
      props.streamGroups.flatMap((dateGroup) =>
        dateGroup.items.map((item) => ({
          id: item.sourceDocument.id,
          date: dateGroup.date,
          revision: buildStreamRevision(item),
        }))
      ),
    [props.streamGroups]
  );
  const motion = useStreamListMotion(motionItems);
  const children: ReactNode[] = [];
  const pendingExits = [...motion.exiting].sort((a, b) => a.index - b.index);
  let flatCardIndex = 0;

  for (const dateGroup of props.streamGroups) {
    children.push(
      <UnifiedGroupHeader
        key={`header:${dateGroup.date}`}
        group={dateGroup}
        mainCurrency={props.mainCurrency}
        {...(props.timeZone != null ? { timeZone: props.timeZone } : {})}
      />
    );
    for (const item of dateGroup.items) {
      const nextExit = pendingExits[0];
      while (nextExit != null && nextExit.index <= flatCardIndex) {
        const exit = pendingExits.shift()!;
        children.push(<StreamExitCard key={`exit:${exit.id}`} id={exit.id} />);
      }
      flatCardIndex += 1;
      children.push(
        <StreamCardMotion
          key={item.sourceDocument.id}
          id={item.sourceDocument.id}
          registerNode={motion.registerNode}
          isEntering={!motion.reducedMotion && motion.entering.has(item.sourceDocument.id)}
          isHighlighted={!motion.reducedMotion && motion.updated.has(item.sourceDocument.id)}
        >
          <UnifiedStreamItemRow
            item={item}
            mainCurrency={props.mainCurrency}
            {...(props.onViewLedgerEntry != null
              ? { onViewLedgerEntry: props.onViewLedgerEntry }
              : {})}
            onViewSourceDetail={props.onViewSourceDetail}
            {...(props.onEditRetry != null ? { onEditRetry: props.onEditRetry } : {})}
            onDeleteSourceConfirm={props.onDeleteSourceConfirm}
            selectionMode={props.isSelectionMode}
            selected={props.selectedIds.includes(item.sourceDocument.id)}
            onToggleSelection={props.onToggleSelection}
            getItemProps={props.getItemProps}
            readOnly={props.readOnly === true}
            defaultExpanded={!props.collapseEntriesDefault}
          />
        </StreamCardMotion>
      );
    }
  }
  for (const exit of pendingExits) {
    children.push(<StreamExitCard key={`exit:${exit.id}`} id={exit.id} />);
  }

  return <div className="space-y-4 pt-2">{children}</div>;
}

function buildStreamRevision(item: UnifiedStreamGroup["items"][number]): string {
  const doc = item.sourceDocument;
  const entries = item.ledgerEntries ?? [];
  return [
    doc.title ?? "",
    doc.status,
    doc.entryDate ?? "",
    doc.updatedAt,
    entries
      .map(
        (entry) =>
          `${entry.id}:${entry.itemName}:${entry.amount}:${entry.currency}:${entry.description ?? ""}`
      )
      .join("|"),
  ].join("|");
}

function StreamCardMotion({
  id,
  registerNode,
  isEntering,
  isHighlighted,
  children,
}: {
  id: string;
  registerNode: StreamListMotionApi["registerNode"];
  isEntering: boolean;
  isHighlighted: boolean;
  children: ReactNode;
}) {
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => registerNode(id, node),
    [id, registerNode]
  );
  return (
    <div
      ref={setNodeRef}
      data-stream-card-id={id}
      className={cn(
        "px-2",
        isEntering && "stream-card-enter",
        isHighlighted && "stream-card-highlight"
      )}
    >
      {children}
    </div>
  );
}

function StreamExitCard({ id }: { id: string }) {
  return (
    <div className="pointer-events-none px-2" aria-hidden data-stream-exit-card={id}>
      <div className="stream-card-exit min-h-[68px] rounded-[var(--radius-xl)] border border-border bg-surface text-text" />
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
