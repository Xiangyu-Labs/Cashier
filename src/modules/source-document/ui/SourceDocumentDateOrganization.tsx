"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Check, Pencil, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import type { LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
import type { DateOrganizationSuggestion } from "../date-organization-contracts";
import type { ApplyDateOrganizationInput } from "../contracts";
import { resolveDateHint } from "../date-organization";

interface Props {
  suggestion: DateOrganizationSuggestion;
  entries: LedgerEntryEmbeddedViewDto[];
  disabled: boolean;
  onApply: (
    input: Omit<ApplyDateOrganizationInput, "sourceDocumentId" | "expectedVersion">
  ) => Promise<unknown>;
  onDismiss: (suggestionId: string) => Promise<unknown>;
  onAdjustmentStateChange?: (active: boolean, dirty: boolean) => void;
}

export function SourceDocumentDateOrganization({
  suggestion,
  entries,
  disabled,
  onApply,
  onDismiss,
  onAdjustmentStateChange,
}: Props) {
  const t = useTranslations("SourceDocumentDetail.dateOrganization");
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
  const apply = async (groupIds: string[]) => {
    setApplicationError(false);
    try {
      await onApply({ suggestionId: suggestion.id, groups, appliedGroupIds: groupIds });
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
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-info/15 px-3 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-info" />
            {t("title")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("pending")}</p>
        </div>
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
            onClick={() =>
              void apply(groups.filter((group) => group.entryDate != null).map((group) => group.id))
            }
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
          <div key={group.id} className="px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarRange className="size-4 text-muted-foreground" />
                  {group.entryDate == null
                    ? t("uncertain")
                    : t("moveTo", { date: group.entryDate, count: group.ledgerEntryIds.length })}
                </div>
                {group.entryDate != null ? (
                  <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                    {group.entryDate === suggestion.sourceDocumentDate
                      ? t("keepsOriginal")
                      : group.ledgerEntryIds.length === entries.length
                        ? t("changesOriginal")
                        : t("createsNew")}
                  </p>
                ) : null}
              </div>
              {group.entryDate != null && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || editing}
                  onClick={() => void apply([group.id])}
                >
                  {group.ledgerEntryIds.length === entries.length
                    ? t("applyDate")
                    : t("applyGroup")}
                </Button>
              )}
            </div>
            <div className="divide-y divide-border/50">
              {group.ledgerEntryIds.map((id) => {
                const entry = entryById.get(id);
                if (entry == null) return null;
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-text">
                      <CategoryIcon iconName={entry.category?.icon ?? null} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{entry.itemName}</span>
                      {suggestionByEntryId.get(id)?.sourceText != null ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {t("recognizedFrom", {
                            text: suggestionByEntryId.get(id)!.sourceText,
                          })}
                          {suggestionByEntryId.get(id)!.dateHint.kind !== "absolute"
                            ? ` · ${t("inferred")}`
                            : ""}
                        </span>
                      ) : null}
                    </span>
                    <AmountText variant="item">
                      {formatCurrencyAmount(entry.amount, entry.currency ?? "", locale)}
                    </AmountText>
                    {editing && (
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
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
