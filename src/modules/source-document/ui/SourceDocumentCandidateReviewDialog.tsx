"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/CategoryIcon";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui";
import { cn } from "@/lib/utils";
import { getSourceDocumentCandidateReviewAction } from "@/modules/source-document/actions";
import type {
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentCandidateReviewRevisionDto,
} from "@/modules/source-document/contracts";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";

interface SourceDocumentCandidateReviewDialogProps {
  ledgerId: string;
  sourceDocumentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mainCurrency: string;
}

export function SourceDocumentCandidateReviewDialog({
  ledgerId,
  sourceDocumentId,
  open,
  onOpenChange,
  mainCurrency,
}: SourceDocumentCandidateReviewDialogProps) {
  const t = useTranslations("CandidateReview");
  const locale = useLocale();
  const reviewQuery = useQuery({
    queryKey: ["sourceDocument", "candidateReview", ledgerId, sourceDocumentId],
    queryFn: () => getSourceDocumentCandidateReviewAction(ledgerId, sourceDocumentId),
    enabled: open,
    staleTime: 0,
  });
  const revisionId = reviewQuery.data?.candidate.revisionId;
  const recovery = useSourceDocumentRecoveryMutations({
    ledgerId,
    sourceDocumentId,
    ...(revisionId == null ? {} : { revisionId }),
    onSuccess: () => onOpenChange(false),
  });
  const isPending = recovery.isReviewing;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent
        variant="detail"
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(88dvh,760px)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:rounded-lg"
        aria-describedby={undefined}
        hideCloseButton={isPending}
        onEscapeKeyDown={(event) => isPending && event.preventDefault()}
        onPointerDownOutside={(event) => isPending && event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {reviewQuery.isLoading ? (
            <div
              className="grid min-w-0 gap-4 md:grid-cols-2"
              aria-busy="true"
              aria-label={t("loading")}
            >
              <RevisionPanelSkeleton />
              <RevisionPanelSkeleton />
            </div>
          ) : reviewQuery.isError || reviewQuery.data == null ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-danger">{t("loadError")}</p>
              <Button variant="outline" size="sm" onClick={() => reviewQuery.refetch()}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("reload")}
              </Button>
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <RevisionPanel
                revision={reviewQuery.data.active}
                label={t("original")}
                tone="original"
                mainCurrency={mainCurrency}
                locale={locale}
                emptyLabel={t("noEntries")}
                entryCountLabel={t("entryCount", { count: reviewQuery.data.active.entryCount })}
              />
              <RevisionPanel
                revision={reviewQuery.data.candidate}
                label={t("candidate")}
                tone="candidate"
                mainCurrency={mainCurrency}
                locale={locale}
                emptyLabel={t("noEntries")}
                entryCountLabel={t("entryCount", { count: reviewQuery.data.candidate.entryCount })}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap-reverse justify-end gap-2 border-t bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-3">
          <Button
            variant="outline"
            onClick={() => recovery.abandonCandidate()}
            disabled={isPending || reviewQuery.data == null}
          >
            {recovery.isAbandoning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("keepOriginal")}
          </Button>
          <Button
            onClick={() => recovery.acceptCandidate()}
            disabled={isPending || reviewQuery.data == null}
          >
            {recovery.isAccepting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {t("acceptCandidate")}
          </Button>
        </div>

        {isPending && (
          <div className="absolute inset-0 z-50 cursor-wait bg-surface/20" aria-hidden />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevisionPanelSkeleton() {
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
            <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
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

function RevisionPanel({
  revision,
  label,
  tone,
  mainCurrency,
  locale,
  emptyLabel,
  entryCountLabel,
}: {
  revision: SourceDocumentCandidateReviewRevisionDto;
  label: string;
  tone: "original" | "candidate";
  mainCurrency: string;
  locale: string;
  emptyLabel: string;
  entryCountLabel: string;
}) {
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
        <div>
          <h3 className={cn("text-sm font-semibold", tone === "candidate" && "text-primary")}>
            {label}
          </h3>
          <p className="text-xs text-muted-foreground">{entryCountLabel}</p>
        </div>
        <AmountText variant="summary">
          {formatCurrencyAmount(revision.total, mainCurrency, locale)}
        </AmountText>
      </header>
      <div className="divide-y divide-border">
        {revision.entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          revision.entries.map((entry) => (
            <ReviewEntry key={entry.id} entry={entry} mainCurrency={mainCurrency} locale={locale} />
          ))
        )}
      </div>
    </section>
  );
}

function ReviewEntry({
  entry,
  mainCurrency,
  locale,
}: {
  entry: SourceDocumentCandidateReviewEntryDto;
  mainCurrency: string;
  locale: string;
}) {
  const currency = entry.currency ?? mainCurrency;
  return (
    <div className="flex min-w-0 items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface2">
        <CategoryIcon iconName={entry.category?.icon ?? null} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-text">{entry.itemName}</p>
        <p className="break-words text-xs text-muted-foreground">
          {entry.category?.name ?? "-"}
          {entry.description != null && entry.description !== "" ? ` · ${entry.description}` : ""}
        </p>
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
}
