"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeDateLabel } from "@/lib/date-utils";
import type { LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
import type { DateOrganizationSuggestion } from "../date-organization-contracts";
import type { ApplyDateOrganizationInput } from "../contracts";
import { resolveDateHint } from "../date-organization";
import { EditableLedgerEntryItem } from "./EditableLedgerEntryItem";

interface Props {
  suggestion: DateOrganizationSuggestion;
  entries: LedgerEntryEmbeddedViewDto[];
  mainCurrency?: string;
  disabled: boolean;
  onApply: (
    input: Omit<ApplyDateOrganizationInput, "sourceDocumentId" | "expectedVersion">
  ) => Promise<unknown>;
  onDismiss: (suggestionId: string) => Promise<unknown>;
  onAdjustmentStateChange?: (active: boolean, dirty: boolean) => void;
  /** Ledger timezone, so 今天/昨天 match the dates the ledger stream groups by. */
  timeZone?: string;
}

export function SourceDocumentDateOrganization({
  suggestion,
  entries,
  mainCurrency = "CNY",
  disabled,
  onApply,
  onDismiss,
  onAdjustmentStateChange,
  timeZone,
}: Props) {
  const t = useTranslations("SourceDocumentDetail.dateOrganization");
  const tCard = useTranslations("SourceDocumentCard");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [applicationError, setApplicationError] = useState(false);
  const [referenceDate, setReferenceDate] = useState(
    suggestion.referenceDate ?? suggestion.sourceDocumentDate
  );
  const suggestionByEntryId = useMemo(
    () => new Map(suggestion.items.map((item) => [item.ledgerEntryId, item])),
    [suggestion.items]
  );
  const initialDates = () =>
    Object.fromEntries(
      entries.map((entry) => [entry.id, suggestionByEntryId.get(entry.id)?.resolvedDate ?? null])
    );
  const [dates, setDates] = useState<Record<string, string | null>>(initialDates);
  const [manuallyAdjustedIds, setManuallyAdjustedIds] = useState<Set<string>>(() => new Set());
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const effectiveDates = dates;
  const groups = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const entry of entries) {
      const date = effectiveDates[entry.id] ?? "retain";
      grouped.set(date, [...(grouped.get(date) ?? []), entry.id]);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => {
        if (a === "retain") return 1;
        if (b === "retain") return -1;
        return b.localeCompare(a);
      })
      .map(([entryDate, ledgerEntryIds]) => ({
        id: entryDate,
        entryDate: entryDate === "retain" ? null : entryDate,
        ledgerEntryIds,
      }));
  }, [effectiveDates, entries]);
  /**
   * Apply every group with a resolved date at once. Groups are never applied
   * individually: the panel's only paths are adjusting the dates and then
   * applying the whole suggestion.
   */
  const applyAll = async () => {
    setApplicationError(false);
    try {
      await onApply({
        suggestionId: suggestion.id,
        groups,
        appliedGroupIds: groups.filter((group) => group.entryDate != null).map((group) => group.id),
      });
      setEditing(false);
      setDirty(false);
      onAdjustmentStateChange?.(false, false);
    } catch {
      setApplicationError(true);
    }
  };

  const resetDraft = () => {
    setEditing(false);
    setReferenceDate(suggestion.referenceDate ?? suggestion.sourceDocumentDate);
    setDates(initialDates());
    setManuallyAdjustedIds(new Set());
    setDirty(false);
    setApplicationError(false);
    onAdjustmentStateChange?.(false, false);
  };

  return (
    <section className="rounded-lg border border-info/30 bg-info/5" aria-label={t("title")}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-info/15 px-3 py-3">
        <div className="min-w-0 text-sm font-semibold">{t("title")}</div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setApplicationError(false);
              void onDismiss(suggestion.id)
                .then(() => onAdjustmentStateChange?.(false, false))
                .catch(() => setApplicationError(true));
            }}
          >
            {t("dismiss")}
          </Button>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setEditing(true);
                onAdjustmentStateChange?.(true, false);
              }}
            >
              <Pencil className="size-3.5" />
              {t("adjust")}
            </Button>
          )}
          <Button
            size="sm"
            disabled={disabled || groups.every((group) => group.entryDate == null)}
            onClick={() => void applyAll()}
          >
            {t("applyAll")}
          </Button>
        </div>
      </header>
      {applicationError ? (
        <p
          className="border-b border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"
          role="alert"
        >
          {t("applyFailed")}
        </p>
      ) : null}
      {editing && (
        <div className="flex flex-wrap items-end gap-2 border-b border-info/15 px-3 py-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            {t("referenceDate")}
            <Input
              type="date"
              className="h-9 w-40"
              value={referenceDate}
              onChange={(event) => {
                const next = event.target.value;
                setReferenceDate(next);
                setDates((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    suggestion.items.flatMap((item) =>
                      item.dateHint.kind === "absolute" ||
                      manuallyAdjustedIds.has(item.ledgerEntryId)
                        ? []
                        : [[item.ledgerEntryId, resolveDateHint(item.dateHint, next)]]
                    )
                  ),
                }));
                setDirty(true);
                onAdjustmentStateChange?.(true, true);
              }}
            />
          </label>
          <Button variant="ghost" size="sm" onClick={resetDraft}>
            <X className="size-3.5" />
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(false);
              onAdjustmentStateChange?.(false, dirty);
            }}
          >
            <Check className="size-3.5" />
            {t("done")}
          </Button>
        </div>
      )}
      <div className="divide-y divide-info/15">
        {groups.map((group) => (
          <div key={group.id} className="py-3">
            <div className="mb-2 px-3 text-sm font-medium">
              {group.entryDate == null
                ? t("uncertain")
                : t("moveTo", {
                    date: formatRelativeDateLabel(
                      group.entryDate,
                      locale,
                      { today: tCard("today"), yesterday: tCard("yesterday") },
                      timeZone
                    ),
                    count: group.ledgerEntryIds.length,
                  })}
            </div>
            <div className="divide-y divide-border/50">
              {group.ledgerEntryIds.map((id) => {
                const entry = entryById.get(id);
                if (entry == null) return null;
                return (
                  // The same row the line-item list renders, in read-only mode.
                  <EditableLedgerEntryItem
                    key={id}
                    ledgerEntry={entry}
                    categories={entry.category != null ? [entry.category] : []}
                    mainCurrency={mainCurrency}
                    sourceDocumentEntryDate={suggestion.sourceDocumentDate}
                    originalEntryDate={suggestion.sourceDocumentDate}
                    readOnly
                    variant="plain"
                    trailing={
                      editing ? (
                        <Input
                          aria-label={t("entryDate", { name: entry.itemName })}
                          type="date"
                          className="h-8 w-36"
                          value={effectiveDates[id] ?? ""}
                          onChange={(event) => {
                            setDates((current) => ({
                              ...current,
                              [id]: event.target.value || null,
                            }));
                            setManuallyAdjustedIds((current) => new Set(current).add(id));
                            setDirty(true);
                            onAdjustmentStateChange?.(true, true);
                          }}
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
