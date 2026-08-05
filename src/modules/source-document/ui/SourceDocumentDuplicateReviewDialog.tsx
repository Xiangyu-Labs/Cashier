"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui";
import { cn } from "@/lib/utils";
import {
  discardDuplicateSourceDocumentAction,
  getSourceDocumentDuplicateReviewAction,
  keepDuplicateSourceDocumentAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentDuplicateReviewDetailDto } from "@/modules/source-document/contracts";
import { storedFileReadUrl } from "../stored-file-read";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocumentCounts,
  invalidateSourceDocumentStream,
  invalidateSourceDocumentStreamTotal,
  queryKeys,
} from "@/lib/query-keys";
import { toast } from "sonner";

interface SourceDocumentDuplicateReviewDialogProps {
  ledgerId: string;
  sourceDocumentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mainCurrency: string;
}

export function SourceDocumentDuplicateReviewDialog({
  ledgerId,
  sourceDocumentId,
  open,
  onOpenChange,
  mainCurrency,
}: SourceDocumentDuplicateReviewDialogProps) {
  const t = useTranslations("DuplicateReview");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const reviewQuery = useQuery({
    queryKey: ["sourceDocument", "duplicateReview", ledgerId, sourceDocumentId],
    queryFn: () => getSourceDocumentDuplicateReviewAction(ledgerId, sourceDocumentId),
    enabled: open,
    staleTime: 0,
  });
  const revisionId = reviewQuery.data?.review.revisionId;

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStream(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStreamTotal(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentCounts(ledgerId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(sourceDocumentId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocumentLight(sourceDocumentId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(ledgerId) }),
    ]);
  }, [ledgerId, queryClient, sourceDocumentId]);

  const keepMutation = useMutation({
    mutationFn: () =>
      keepDuplicateSourceDocumentAction(ledgerId, sourceDocumentId, revisionId ?? ""),
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
    },
    onError: () => toast.error(t("actionFailed")),
  });
  const discardMutation = useMutation({
    mutationFn: () =>
      discardDuplicateSourceDocumentAction(ledgerId, sourceDocumentId, revisionId ?? ""),
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
    },
    onError: () => toast.error(t("actionFailed")),
  });
  const isPending = keepMutation.isPending || discardMutation.isPending;
  const data = reviewQuery.data;
  const confidence =
    data?.review.confidence == null ? null : Math.round(data.review.confidence * 100);

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
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-warning" />
            {t("title")}
            {confidence != null && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                {t("confidence", { percent: confidence })}
              </span>
            )}
          </DialogTitle>
          {data?.review.reason != null && data.review.reason !== "" && (
            <p className="mt-1 text-xs text-muted-foreground">{data.review.reason}</p>
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
                <ReviewPanel
                  side={data.matched}
                  label={t("original")}
                  tone="original"
                  mainCurrency={mainCurrency}
                  locale={locale}
                />
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
            onClick={() => discardMutation.mutate()}
            disabled={isPending || data == null}
          >
            {discardMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {t("discard")}
          </Button>
          <Button onClick={() => keepMutation.mutate()} disabled={isPending || data == null}>
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

function ReviewPanel({
  side,
  label,
  tone,
  mainCurrency,
  locale,
}: {
  side: ReviewSide;
  label: string;
  tone: "original" | "candidate";
  mainCurrency: string;
  locale: string;
}) {
  const t = useTranslations("DuplicateReview");
  const total = side.entries.reduce((sum, entry) => {
    const amount = Number(entry.convertedAmount ?? entry.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

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
          <h3 className={cn("text-sm font-semibold", tone === "candidate" && "text-primary")}>
            {label}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {side.title?.trim() || t("untitled")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("date", { date: side.entryDate ?? side.createdAt.slice(0, 10) })}
          </p>
        </div>
        <AmountText variant="summary">
          {formatCurrencyAmount(total, mainCurrency, locale)}
        </AmountText>
      </header>

      {side.files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
          {side.files.slice(0, 4).map((file) => (
            <Image
              key={file.id}
              src={storedFileReadUrl(file.id)}
              alt={file.originalFilename ?? ""}
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
              loading="lazy"
            />
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
                    {formatCurrencyAmount(Number(entry.amount), currency, locale)}
                  </AmountText>
                  {entry.convertedAmount != null && currency !== mainCurrency && (
                    <AmountText variant="secondary">
                      {formatCurrencyAmount(Number(entry.convertedAmount), mainCurrency, locale)}
                    </AmountText>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
