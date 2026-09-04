import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrencyAmount } from "@/lib/format/currency";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import { EntryGroupHeader } from "@/components/EntryGroupHeader";
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
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
  disableUnselected?: boolean;
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
  disableUnselected = false,
  onToggleSelection,
  noRecordsText,
  getItemProps,
  timeZone,
  readOnly = false,
  collapseEntriesDefault = false,
}: UnifiedStreamGroupProps) {
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
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
    selectedIdSet,
    disableUnselected,
    onToggleSelection,
    noRecordsText,
    getItemProps,
    ...(timeZone != null ? { timeZone } : {}),
    collapseEntriesDefault,
  } satisfies Omit<UnifiedStreamGroupProps, "readOnly"> & {
    selectedIdSet: ReadonlySet<string>;
  };

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
  const selectedIdSet = useMemo(() => new Set(props.selectedIds), [props.selectedIds]);
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
                selected={selectedIdSet.has(item.sourceDocument.id)}
                selectionDisabled={
                  props.disableUnselected === true && !selectedIdSet.has(item.sourceDocument.id)
                }
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
const VIRTUALIZATION_THRESHOLD = 80;

type InteractiveUnifiedGroupsProps = UnifiedStreamGroupProps & {
  selectedIdSet: ReadonlySet<string>;
};

type ControlledInteractiveGroupsProps = InteractiveUnifiedGroupsProps & {
  getExpanded: (sourceDocumentId: string) => boolean;
  onExpandedChange: (sourceDocumentId: string, expanded: boolean) => void;
};

function InteractiveUnifiedGroups(props: InteractiveUnifiedGroupsProps) {
  const [expandedById, setExpandedById] = useState(() => new Map<string, boolean>());
  const defaultExpanded = !props.collapseEntriesDefault;
  const getExpanded = useCallback(
    (sourceDocumentId: string) => expandedById.get(sourceDocumentId) ?? defaultExpanded,
    [defaultExpanded, expandedById]
  );
  const onExpandedChange = useCallback((sourceDocumentId: string, expanded: boolean) => {
    setExpandedById((current) => {
      const next = new Map(current);
      next.set(sourceDocumentId, expanded);
      return next;
    });
  }, []);
  const documentCount = props.streamGroups.reduce((total, group) => total + group.items.length, 0);
  const controlledProps = { ...props, getExpanded, onExpandedChange };

  return documentCount <= VIRTUALIZATION_THRESHOLD ? (
    <AnimatedInteractiveGroups {...controlledProps} />
  ) : (
    <VirtualizedInteractiveGroups {...controlledProps} />
  );
}

function AnimatedInteractiveGroups(props: ControlledInteractiveGroupsProps) {
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
  // Immutable cursor over the sorted exit list. `renderedSlotCount` counts
  // every rendered slot (normal cards + exit placeholders) so exit copies are
  // placed at their previous flat position and each exit renders exactly once.
  let exitCursor = 0;
  let renderedSlotCount = 0;

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
      let nextExit = pendingExits[exitCursor];
      while (nextExit != null && nextExit.index <= renderedSlotCount) {
        const exit = nextExit;
        children.push(<StreamExitCard key={`exit:${exit.id}`} id={exit.id} />);
        exitCursor += 1;
        renderedSlotCount += 1;
        nextExit = pendingExits[exitCursor];
      }
      renderedSlotCount += 1;
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
            selected={props.selectedIdSet.has(item.sourceDocument.id)}
            selectionDisabled={
              props.disableUnselected === true && !props.selectedIdSet.has(item.sourceDocument.id)
            }
            onToggleSelection={props.onToggleSelection}
            getItemProps={props.getItemProps}
            readOnly={props.readOnly === true}
            defaultExpanded={!props.collapseEntriesDefault}
            expanded={props.getExpanded(item.sourceDocument.id)}
            onExpandedChange={props.onExpandedChange}
          />
        </StreamCardMotion>
      );
    }
  }
  for (; exitCursor < pendingExits.length; exitCursor += 1) {
    const exit = pendingExits[exitCursor];
    if (exit == null) continue;
    children.push(<StreamExitCard key={`exit:${exit.id}`} id={exit.id} />);
  }

  return <div className="space-y-4 pt-2">{children}</div>;
}

function buildStreamRevision(item: UnifiedStreamGroup["items"][number]): string {
  const doc = item.sourceDocument;
  return `${doc.version}:${doc.updatedAt}`;
}

type VirtualStreamRow =
  | { key: string; kind: "header"; group: UnifiedStreamGroup }
  | { key: string; kind: "card"; item: UnifiedStreamGroup["items"][number] };

function flattenStreamGroups(groups: readonly UnifiedStreamGroup[]): VirtualStreamRow[] {
  return groups.flatMap((group) => [
    {
      key: `header:${group.date}:${group.items[0]?.sourceDocument.id ?? "empty"}`,
      kind: "header" as const,
      group,
    },
    ...group.items.map((item) => ({
      key: item.sourceDocument.id,
      kind: "card" as const,
      item,
    })),
  ]);
}

function VirtualizedInteractiveGroups(props: ControlledInteractiveGroupsProps) {
  const rows = useMemo(() => flattenStreamGroups(props.streamGroups), [props.streamGroups]);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list == null) return;
    const update = () => {
      setScrollMargin(list.getBoundingClientRect().top + window.scrollY);
    };
    update();
    window.addEventListener("resize", update);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (resizeObserver != null) {
      let current: Element | null = list;
      while (current != null) {
        resizeObserver.observe(current);
        for (
          let sibling = current.previousElementSibling;
          sibling != null;
          sibling = sibling.previousElementSibling
        ) {
          resizeObserver.observe(sibling);
        }
        current = current.parentElement;
      }
    }
    return () => {
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
    };
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      const row = rows[index];
      if (row == null || row.kind === "header") return 48;
      if (!props.getExpanded(row.item.sourceDocument.id)) return 88;
      return 96 + 72 * row.item.ledgerEntries.length;
    },
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 6,
    scrollMargin,
  });

  return (
    <div
      ref={listRef}
      className="relative w-full pt-2"
      style={{ height: virtualizer.getTotalSize() }}
      data-testid="virtualized-source-document-stream"
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (row == null) return null;
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
          >
            {row.kind === "header" ? (
              <UnifiedGroupHeader
                group={row.group}
                mainCurrency={props.mainCurrency}
                {...(props.timeZone != null ? { timeZone: props.timeZone } : {})}
              />
            ) : (
              <div className="px-2 pb-4">
                <UnifiedStreamItemRow
                  item={row.item}
                  mainCurrency={props.mainCurrency}
                  {...(props.onViewLedgerEntry != null
                    ? { onViewLedgerEntry: props.onViewLedgerEntry }
                    : {})}
                  onViewSourceDetail={props.onViewSourceDetail}
                  {...(props.onEditRetry != null ? { onEditRetry: props.onEditRetry } : {})}
                  onDeleteSourceConfirm={props.onDeleteSourceConfirm}
                  selectionMode={props.isSelectionMode}
                  selected={props.selectedIdSet.has(row.item.sourceDocument.id)}
                  selectionDisabled={
                    props.disableUnselected === true &&
                    !props.selectedIdSet.has(row.item.sourceDocument.id)
                  }
                  onToggleSelection={props.onToggleSelection}
                  getItemProps={props.getItemProps}
                  readOnly={false}
                  defaultExpanded={!props.collapseEntriesDefault}
                  expanded={props.getExpanded(row.item.sourceDocument.id)}
                  onExpandedChange={props.onExpandedChange}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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
  selectionDisabled: boolean;
  onToggleSelection: (id: string) => void;
  getItemProps: () => Record<string, unknown>;
  readOnly: boolean;
  defaultExpanded: boolean;
  expanded?: boolean;
  onExpandedChange?: (sourceDocumentId: string, expanded: boolean) => void;
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
  selectionDisabled,
  onToggleSelection,
  getItemProps,
  readOnly,
  defaultExpanded,
  expanded,
  onExpandedChange,
}: UnifiedStreamItemRowProps) {
  const sourceDocument = item.sourceDocument as SourceDocument;
  const ledgerEntries = item.ledgerEntries as LedgerEntry[];
  const handleExpandedChange = useCallback(
    (nextExpanded: boolean) => onExpandedChange?.(sourceDocument.id, nextExpanded),
    [onExpandedChange, sourceDocument.id]
  );

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
        errorCode={item.sourceDocument.errorCode}
        selectionMode={selectionMode}
        isSelected={selected}
        selectionDisabled={selectionDisabled}
        onToggleSelect={() => onToggleSelection(sourceDocument.id)}
        readOnly={readOnly}
        defaultExpanded={defaultExpanded}
        {...(expanded === undefined ? {} : { expanded })}
        {...(onExpandedChange === undefined ? {} : { onExpandedChange: handleExpandedChange })}
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

function useGroupHeaderStrings() {
  const t = useTranslations("SourceDocumentCard");
  return t;
}
