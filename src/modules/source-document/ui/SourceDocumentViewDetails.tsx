"use client";
import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import Image from "next/image";
import { type ReactNode, useEffect, useMemo, useState, memo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateFilter } from "@/components/ui/date-filter";
import { Wallet, FileText, ImagePlay, Maximize2, CheckSquare, X } from "lucide-react";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/lib/formatters";
import { EditableLedgerEntryItem } from "./EditableLedgerEntryItem";
import type { EntryEditData } from "@/modules/source-document/types";
import { SourceDocumentImageModal } from "./SourceDocumentImageModal";
import {
  buildSourceDocumentDetailViewModel,
  type SourceDocumentDetailDisplayEntry,
} from "./source-document-detail-view-model";
import { storedFileReadUrl } from "../stored-file-read";
import {
  cacheOfflineImage,
  getActiveOfflineSnapshotKey,
  rememberViewedDocument,
} from "@/modules/offline/offline-store";

interface CurrencyBreakdownItemProps {
  currency: string;
  amount: number;
  mainCurrency: string;
  entries: SourceDocumentDetailDisplayEntry[];
}

function CurrencyBreakdownItem({
  currency,
  amount,
  mainCurrency,
  entries,
}: CurrencyBreakdownItemProps) {
  const locale = useLocale();
  const converted = useMemo(() => {
    const currencyEntries = entries.filter((e) => (e.currency ?? mainCurrency) === currency);
    return currencyEntries.reduce((total, entry) => total + (entry.convertedAmount ?? 0), 0);
  }, [entries, currency, mainCurrency]);

  return (
    <span className="text-xs text-muted-foreground/80">
      <AmountText variant="group">{formatCurrencyAmount(amount, currency, locale)}</AmountText>
      {currency !== mainCurrency && (
        <AmountText variant="secondary" className="ml-1.5">
          (≈ {formatCurrencyAmount(converted, mainCurrency, locale)})
        </AmountText>
      )}
    </span>
  );
}

export interface SourceDocPendingChanges {
  title?: string;
  entryDate?: string;
}

export interface EntriesPendingChanges {
  [entryId: string]: Partial<EntryEditData>;
}

export interface PendingChanges {
  sourceDoc: SourceDocPendingChanges;
  entries: EntriesPendingChanges;
}

interface SourceDocumentViewDetailsProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  ledgerEntries: LedgerEntry[];
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
  onSelectAllEntries: (selected: boolean) => void;
  onToggleSelectionMode: () => void;
  readOnly?: boolean;
  offlineImageUrls?: ReadonlyMap<string, string>;
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
  onSelectAllEntries: _onSelectAllEntries,
  onToggleSelectionMode,
  readOnly = false,
  offlineImageUrls,
}: SourceDocumentViewDetailsProps): ReactNode {
  const t = useTranslations("SourceDocumentDetail");
  const tCard = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const displayEntryDate = pendingChanges.sourceDoc.entryDate ?? sourceDocument.entryDate ?? "";

  const { displayEntries, subtotalsByCurrency, totalInMainCurrency } = useMemo(
    () =>
      buildSourceDocumentDetailViewModel({
        ledgerEntries,
        pendingChanges,
        mainCurrency,
      }),
    [ledgerEntries, mainCurrency, pendingChanges]
  );

  const uniqueCurrencies = Object.keys(subtotalsByCurrency);
  const displayEntriesById = useMemo(
    () => new Map(displayEntries.map((entry) => [entry.id, entry])),
    [displayEntries]
  );

  const sortedEntries = useMemo(() => {
    return [...ledgerEntries].sort((a, b) => {
      const aOrder = a.category?.sortOrder ?? 999999;
      const bOrder = b.category?.sortOrder ?? 999999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (
        (displayEntriesById.get(b.id)?.amount ?? parseAmount(b.amount)) -
        (displayEntriesById.get(a.id)?.amount ?? parseAmount(a.amount))
      );
    });
  }, [displayEntriesById, ledgerEntries]);

  const isAnomaly = sourceDocument.status === "anomaly";
  const files = sourceDocument.files;
  const hasImages = files.length > 0;
  const hasRawText = sourceDocument.text != null && sourceDocument.text.trim().length > 0;
  const selectedImageIndex = Math.min(activeImageIndex, Math.max(files.length - 1, 0));

  useEffect(() => {
    if (readOnly || files.length === 0) return;
    const snapshotKey = getActiveOfflineSnapshotKey();
    if (snapshotKey == null || !snapshotKey.endsWith(`:${sourceDocument.ledgerId}`)) return;
    void rememberViewedDocument({ snapshotKey, document: sourceDocument, ledgerEntries }).catch(
      () => {}
    );
    for (const file of files) {
      void cacheOfflineImage({
        snapshotKey,
        documentId: sourceDocument.id,
        documentTimestamp: sourceDocument.entryDate ?? sourceDocument.createdAt,
        file,
        viewed: true,
      }).catch(() => false);
    }
  }, [files, ledgerEntries, readOnly, sourceDocument]);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{t("transactionTime")}:</span>
            <DateFilter
              value={displayEntryDate}
              onChange={(date) => {
                if (date) {
                  onSourceDocChange({ entryDate: formatDateTimeForApi(date) });
                }
              }}
              size="sm"
              className="h-8 min-w-fit shrink-0"
              truncate={false}
              disabled={readOnly}
            />
            {isAnomaly && (
              <Badge variant="error" className="h-5 rounded-full px-1.5 text-xs font-medium">
                {tCommon("error")}
              </Badge>
            )}
            <span className="text-muted-foreground/30 hidden sm:inline">|</span>
            <span className="hidden text-xs text-muted-foreground/50 sm:inline">
              {t("createdAt")}:{" "}
              {new Date(sourceDocument.createdAt).toLocaleString(locale, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm py-1">
          <Wallet className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-xs font-medium text-muted-foreground/60">{t("totalAmount")}:</span>
          <AmountText variant="summary">
            {formatCurrencyAmount(totalInMainCurrency, mainCurrency, locale)}
          </AmountText>
          {uniqueCurrencies.length > 1 && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-muted-foreground/30">·</span>
              {uniqueCurrencies.map((curr) => (
                <CurrencyBreakdownItem
                  key={curr}
                  currency={curr}
                  amount={subtotalsByCurrency[curr] ?? 0}
                  mainCurrency={mainCurrency}
                  entries={displayEntries}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center gap-2">
            {sortedEntries.length > 0 && !readOnly && (
              <Button
                variant={isSelectionMode ? "secondary" : "ghost"}
                size="icon"
                onClick={onToggleSelectionMode}
                className="shrink-0 h-8 w-8"
                title={isSelectionMode ? t("cancelSelect") : t("select")}
              >
                {isSelectionMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
              </Button>
            )}
            <span className="text-xs font-semibold text-muted-foreground">
              {t("entries")} ({ledgerEntries.length})
            </span>
          </div>
        </div>

        <div className="space-y-2 pb-2">
          {sortedEntries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 md:p-12 text-center border border-dashed border-border/80 rounded-2xl bg-surface2/5">
              <p className="text-muted-foreground text-sm font-medium">{t("noEntries")}</p>
            </div>
          ) : (
            sortedEntries.map((entry) => (
              <Card
                key={entry.id}
                className={cn(
                  "overflow-hidden",
                  selectedEntryIds.includes(entry.id) &&
                    isSelectionMode &&
                    "border-primary bg-primary/5"
                )}
              >
                <EditableLedgerEntryItem
                  ledgerEntry={entry}
                  categories={categories}
                  categoryPlaceholder={t("selectCategory")}
                  preferredCurrencies={preferredCurrencies}
                  mainCurrency={mainCurrency}
                  selected={selectedEntryIds.includes(entry.id)}
                  onChange={(changes) => onEntryChange(entry.id, changes)}
                  sourceDocumentEntryDate={displayEntryDate}
                  readOnly={readOnly}
                  {...(isSelectionMode
                    ? { onSelect: (selected: boolean) => onSelectEntry(entry.id, selected) }
                    : {})}
                  {...(pendingChanges.entries[entry.id] !== undefined
                    ? { pendingChanges: pendingChanges.entries[entry.id] }
                    : {})}
                />
              </Card>
            ))
          )}
        </div>
      </div>

      {(hasImages || hasRawText) && (
        <section className="shrink-0 overflow-hidden rounded-lg border border-border/60 bg-surface2/20">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <FileText className="h-3 w-3 text-primary/70" />
              {t("rawEvidence")}
              {(hasImages || hasRawText) && (
                <span className="text-xs font-normal text-muted-foreground/60">
                  (
                  {[hasImages && `${files.length} ${tCard("image")}`, hasRawText && t("rawContent")]
                    .filter(Boolean)
                    .join(", ")}
                  )
                </span>
              )}
            </div>
          </header>

          <div className="space-y-4 px-3 pb-3 pt-3">
            {(hasImages || isLoadingImages) && (
              <div>
                <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60">
                  <ImagePlay className="h-3 w-3 text-primary/60" />
                  {tCard("image")}
                </h5>
                {isLoadingImages ? (
                  <div
                    data-testid="source-document-image-stage-loading"
                    className="aspect-[4/3] w-full animate-pulse rounded-md border border-border/50 bg-border/40 sm:max-h-[52dvh]"
                  />
                ) : files[selectedImageIndex] != null ? (
                  <>
                    <button
                      type="button"
                      data-testid="source-document-image-stage"
                      className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-surface2/70 transition-[border-color,background-color] duration-[var(--motion-feedback)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-h-[52dvh]"
                      onClick={() => setViewerIndex(selectedImageIndex)}
                      aria-label={tCard("imageAlt", { index: selectedImageIndex + 1 })}
                    >
                      {offlineImageUrls?.get(files[selectedImageIndex].id) != null ? (
                        <Image
                          src={offlineImageUrls.get(files[selectedImageIndex].id)!}
                          alt={tCard("imageAlt", { index: selectedImageIndex + 1 })}
                          fill
                          unoptimized
                          className="object-contain p-2"
                        />
                      ) : !readOnly ? (
                        <Image
                          src={storedFileReadUrl(files[selectedImageIndex].id)}
                          alt={tCard("imageAlt", { index: selectedImageIndex + 1 })}
                          fill
                          className="object-contain p-2"
                        />
                      ) : null}
                      <span className="fine-pointer-reveal absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-md bg-text/70 text-bg opacity-0 transition-opacity duration-[var(--motion-feedback)] group-focus-visible:opacity-100 group-active:opacity-100">
                        <Maximize2 className="h-4 w-4" />
                      </span>
                    </button>
                    {files.length > 1 ? (
                      <div
                        className="mt-2 flex gap-2 overflow-x-auto pb-1"
                        aria-label={tCard("image")}
                      >
                        {files.map((file, index) => {
                          const offlineUrl = offlineImageUrls?.get(file.id);
                          const src = offlineUrl ?? (!readOnly ? storedFileReadUrl(file.id) : null);
                          return (
                            <button
                              key={file.id}
                              type="button"
                              className={cn(
                                "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-surface2 transition-[border-color,opacity] duration-[var(--motion-feedback)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedImageIndex === index
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border opacity-75"
                              )}
                              onClick={() => setActiveImageIndex(index)}
                              aria-label={tCard("imageAlt", { index: index + 1 })}
                              aria-current={selectedImageIndex === index ? "true" : undefined}
                            >
                              {src != null ? (
                                <Image
                                  src={src}
                                  alt=""
                                  fill
                                  unoptimized={offlineUrl != null}
                                  className="object-cover"
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}

            {hasRawText && (
              <div>
                <h5 className="mb-2 text-xs font-medium text-muted-foreground/60">
                  {t("rawContent")}
                </h5>
                <div className="whitespace-pre-wrap break-words rounded-lg border border-border/40 bg-surface/50 p-3 text-sm leading-relaxed text-text/70">
                  {sourceDocument.text}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <SourceDocumentImageModal
        images={files.map((file) => ({
          data: offlineImageUrls?.get(file.id) ?? "",
          mimeType: file.contentType,
          ...(!readOnly ? { storedFileId: file.id } : {}),
        }))}
        initialIndex={viewerIndex ?? 0}
        open={viewerIndex !== null}
        onOpenChange={(open: boolean) => !open && setViewerIndex(null)}
      />
    </div>
  );
});
