"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Check, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import { cn } from "@/lib/utils";
import {
  discardDuplicateSourceDocumentAction,
  getSourceDocumentDuplicateReviewAction,
  keepDuplicateSourceDocumentAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentDuplicateReviewDetailDto } from "@/modules/source-document/contracts";
import { storedFileReadUrl } from "../stored-file-read";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { SourceDocumentImageModal } from "./SourceDocumentImageModal";
import { normalizeDuplicateReason } from "@/modules/source-document/duplicate-reason";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { add } from "@/lib/money/decimal";

interface SourceDocumentDuplicateReviewDialogProps {
  ledgerId: string;
  sourceDocumentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mainCurrency: string;
  onBack?: () => void;
  onExitComplete?: () => void;
}

export function SourceDocumentDuplicateReviewDialog({
  ledgerId,
  sourceDocumentId,
  open,
  onOpenChange,
  mainCurrency,
  onBack,
  onExitComplete,
}: SourceDocumentDuplicateReviewDialogProps) {
  const t = useTranslations("DuplicateReview");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const reviewQueryKey = queryKeys.sourceDocumentDuplicateReview(ledgerId, sourceDocumentId);
  const reviewQuery = useQuery({
    queryKey: reviewQueryKey,
    queryFn: () => getSourceDocumentDuplicateReviewAction(ledgerId, sourceDocumentId),
    enabled: open,
    staleTime: 0,
  });
  const revisionId = reviewQuery.data?.review.revisionId;

  const removeResolvedDocumentQueries = useCallback(() => {
    queryClient.removeQueries({ queryKey: reviewQueryKey });
    queryClient.removeQueries({ queryKey: queryKeys.sourceDocument(ledgerId, sourceDocumentId) });
    queryClient.removeQueries({
      queryKey: queryKeys.sourceDocumentLight(ledgerId, sourceDocumentId),
    });
    queryClient.removeQueries({
      queryKey: queryKeys.sourceDocumentFull(ledgerId, sourceDocumentId),
    });
  }, [ledgerId, queryClient, reviewQueryKey, sourceDocumentId]);

  const closeResolvedReview = useCallback(() => {
    removeResolvedDocumentQueries();
    setDiscardConfirmOpen(false);
    onOpenChange(false);
  }, [onOpenChange, removeResolvedDocumentQueries]);

  const keepMutation = useLedgerMutation<
    Awaited<ReturnType<typeof keepDuplicateSourceDocumentAction>>,
    { operationId: string }
  >(ledgerId, {
    mutationFn: ({ operationId }: { operationId: string }) => {
      if (revisionId == null || revisionId === "") {
        throw new Error("Duplicate review revision is unavailable");
      }
      return keepDuplicateSourceDocumentAction(ledgerId, sourceDocumentId, revisionId, operationId);
    },
    resourceGroups: ["documents"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    successMessage: t("keepSuccess"),
    errorMessage: t("actionFailed"),
    onSuccess: closeResolvedReview,
  });
  const discardMutation = useLedgerMutation<
    Awaited<ReturnType<typeof discardDuplicateSourceDocumentAction>>,
    { operationId: string }
  >(ledgerId, {
    mutationFn: ({ operationId }: { operationId: string }) => {
      if (revisionId == null || revisionId === "") {
        throw new Error("Duplicate review revision is unavailable");
      }
      return discardDuplicateSourceDocumentAction(
        ledgerId,
        sourceDocumentId,
        revisionId,
        operationId
      );
    },
    resourceGroups: ["documents"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    successMessage: t("discardSuccess"),
    errorMessage: t("actionFailed"),
    onSuccess: closeResolvedReview,
  });
  const isPending = keepMutation.isPending || discardMutation.isPending;
  const data = reviewQuery.data;
  const displayReason =
    data?.review.reason == null
      ? null
      : normalizeDuplicateReason({
          reason: data.review.reason,
          currentSourceDocumentId: data.duplicate.id,
          candidateSourceDocumentIds: data.matched == null ? [] : [data.matched.id],
          aiLanguage: locale,
        });
  const duplicateSummary = summarizeReviewEntries(data?.duplicate.entries ?? [], mainCurrency);
  const duplicateDate = data?.duplicate.entryDate ?? data?.duplicate.createdAt.slice(0, 10) ?? "";
  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
        <DialogContent
          variant="detail"
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(88dvh,760px)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:rounded-lg"
          aria-describedby={undefined}
          hideCloseButton={isPending}
          onEscapeKeyDown={(event) => isPending && event.preventDefault()}
          onPointerDownOutside={(event) => isPending && event.preventDefault()}
          {...(onExitComplete !== undefined ? { onExitComplete } : {})}
        >
          <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              {onBack != null && (
                <Button type="button" variant="ghost" size="icon" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">{tCommon("back")}</span>
                </Button>
              )}
              <ShieldCheck className="h-4 w-4 text-warning" />
              {t("title")}
            </DialogTitle>
            {displayReason != null && displayReason !== "" && (
              <p className="mt-1 text-xs text-muted-foreground">{displayReason}</p>
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {reviewQuery.isLoading ? (
              <div className="grid min-w-0 gap-4 md:grid-cols-2" aria-busy="true">
                <ReviewPanelSkeleton />
                <ReviewPanelSkeleton />
              </div>
            ) : reviewQuery.isError || data == null ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-danger">{t("loadError")}</p>
                <Button variant="outline" size="sm" onClick={() => reviewQuery.refetch()}>
                  {t("reload")}
                </Button>
              </div>
            ) : (
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                {data.matched != null ? (
                  <>
                    {(data.matchedState === "modified" || data.matchedState === "deleted") && (
                      <div className="col-span-full rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-text">
                        {data.matchedState === "modified"
                          ? t("matchedModified")
                          : t("matchedDeleted")}
                      </div>
                    )}
                    <ReviewPanel
                      side={data.matched}
                      label={t("original")}
                      tone="original"
                      badge={t("snapshotVersion")}
                      mainCurrency={mainCurrency}
                      locale={locale}
                    />
                  </>
                ) : (
                  <div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-surface px-4 text-center text-sm text-muted-foreground">
                    {t("matchedMissing")}
                  </div>
                )}
                <ReviewPanel
                  side={data.duplicate}
                  label={t("newBill")}
                  tone="candidate"
                  mainCurrency={mainCurrency}
                  locale={locale}
                />
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap-reverse justify-end gap-2 border-t bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setDiscardConfirmOpen(true)}
              disabled={isPending || data == null}
            >
              {discardMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("discard")}
            </Button>
            <Button
              onClick={() => keepMutation.mutate({ operationId: crypto.randomUUID() })}
              disabled={isPending || data == null}
            >
              {keepMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t("keep")}
            </Button>
          </div>

          {isPending && (
            <div className="absolute inset-0 z-50 cursor-wait bg-surface/20" aria-hidden />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={(nextOpen) => !isPending && setDiscardConfirmOpen(nextOpen)}
        title={t("discardConfirmTitle")}
        description={t("discardConfirmDescription", {
          date: duplicateDate,
          amount: formatCurrencyAmount(duplicateSummary.total, mainCurrency, locale),
          count: data?.duplicate.entries.length ?? 0,
        })}
        confirmLabel={t("discard")}
        variant="destructive"
        onConfirm={() => discardMutation.mutate({ operationId: crypto.randomUUID() })}
      />
    </>
  );
}

function ReviewPanelSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="space-y-0 divide-y divide-border">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-surface2", className)} />;
}

interface ReviewSide {
  id: string;
  title: string | null;
  entryDate: string | null;
  createdAt: string;
  entries: SourceDocumentDuplicateReviewDetailDto["duplicate"]["entries"];
  files: SourceDocumentDuplicateReviewDetailDto["duplicate"]["files"];
}

function summarizeReviewEntries(
  entries: ReviewSide["entries"],
  mainCurrency: string
): { total: string; unconvertedCount: number; currencyTotals: Record<string, string> } {
  let total = "0";
  let unconvertedCount = 0;
  const currencyTotals: Record<string, string> = {};
  for (const entry of entries) {
    const currency = (entry.currency ?? mainCurrency).trim().toUpperCase();
    if (entry.convertedAmount != null && entry.convertedAmount !== "") {
      total = add(total, entry.convertedAmount);
    } else if (currency === mainCurrency.trim().toUpperCase()) {
      total = add(total, entry.amount);
    } else {
      unconvertedCount += 1;
      currencyTotals[currency] = add(currencyTotals[currency] ?? "0", entry.amount);
    }
  }
  return { total, unconvertedCount, currencyTotals };
}

function ReviewPanel({
  side,
  label,
  tone,
  badge,
  mainCurrency,
  locale,
}: {
  side: ReviewSide;
  label: string;
  tone: "original" | "candidate";
  badge?: string;
  mainCurrency: string;
  locale: string;
}) {
  const t = useTranslations("DuplicateReview");
  const [imageViewer, setImageViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });
  const summary = summarizeReviewEntries(side.entries, mainCurrency);

  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border bg-surface",
        tone === "candidate" ? "border-primary/40" : "border-border"
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3",
          tone === "candidate" ? "bg-primary/5" : "bg-surface2/50"
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-sm font-semibold", tone === "candidate" && "text-primary")}>
              {label}
            </h3>
            {badge != null && (
              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {side.title?.trim() || t("untitled")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("date", { date: side.entryDate ?? side.createdAt.slice(0, 10) })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <AmountText variant="summary">
            {formatCurrencyAmount(summary.total, mainCurrency, locale)}
          </AmountText>
          {Object.entries(summary.currencyTotals).map(([currency, total]) => (
            <AmountText key={currency} variant="secondary">
              {formatCurrencyAmount(total, currency, locale)}
            </AmountText>
          ))}
          {summary.unconvertedCount > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {t("unconverted", { count: summary.unconvertedCount })}
            </p>
          )}
        </div>
      </header>

      {side.files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
          {side.files.map((file, index) => (
            <button
              key={file.id}
              type="button"
              className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => setImageViewer({ open: true, index })}
              aria-label={t("viewImage", {
                filename: file.originalFilename ?? t("image"),
              })}
            >
              <Image
                src={storedFileReadUrl(file.id)}
                alt={file.originalFilename ?? t("image")}
                width={64}
                height={64}
                unoptimized
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      <div className="divide-y divide-border">
        {side.entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noEntries")}</p>
        ) : (
          side.entries.map((entry) => {
            const currency = entry.currency ?? mainCurrency;
            return (
              <div key={entry.id} className="flex min-w-0 items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-text">{entry.itemName}</p>
                  {entry.description != null && entry.description !== "" && (
                    <p className="break-words text-xs text-muted-foreground">{entry.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <AmountText variant="item">
                    {formatCurrencyAmount(entry.amount, currency, locale)}
                  </AmountText>
                  {entry.convertedAmount != null && currency !== mainCurrency && (
                    <AmountText variant="secondary">
                      {formatCurrencyAmount(entry.convertedAmount, mainCurrency, locale)}
                    </AmountText>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <SourceDocumentImageModal
        images={side.files.map((file) => ({
          data: "",
          mimeType: file.contentType,
          storedFileId: file.id,
        }))}
        initialIndex={imageViewer.index}
        open={imageViewer.open}
        onOpenChange={(open) => setImageViewer((previous) => ({ ...previous, open }))}
      />
    </section>
  );
}
