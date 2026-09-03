"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Check, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrencyAmount } from "@/lib/format/currency";
import {
  discardDuplicateSourceDocumentAction,
  getSourceDocumentDuplicateReviewAction,
  keepDuplicateSourceDocumentAction,
} from "@/modules/source-document/actions";
import { queryKeys } from "@/lib/query-keys";
import { useSourceDocumentRevisionDecisionMutation } from "@/modules/source-document/hooks/useSourceDocumentRevisionDecisionMutation";
import { normalizeDuplicateReason } from "@/modules/source-document/duplicate-reason";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { summarizeReviewEntries } from "./source-document-duplicate-review.utils";
import { ReviewPanel } from "./SourceDocumentDuplicateReviewDialog/components/ReviewPanel";
import { SourceDocumentReviewDialogContent } from "./SourceDocumentReviewDialogContent";

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
  const tReview = useTranslations("ReviewDialog");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discardRevisionId, setDiscardRevisionId] = useState<string | null>(null);
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
    setDiscardRevisionId(null);
    onOpenChange(false);
  }, [onOpenChange, removeResolvedDocumentQueries]);

  const keepMutation = useSourceDocumentRevisionDecisionMutation({
    ledgerId,
    sourceDocumentId,
    ...(revisionId === undefined ? {} : { revisionId }),
    action: keepDuplicateSourceDocumentAction,
    successMessage: t("keepSuccess"),
    errorMessage: t("actionFailed"),
    onSuccess: closeResolvedReview,
  });
  const discardMutation = useSourceDocumentRevisionDecisionMutation({
    ledgerId,
    sourceDocumentId,
    ...(revisionId === undefined ? {} : { revisionId }),
    action: discardDuplicateSourceDocumentAction,
    successMessage: t("discardSuccess"),
    errorMessage: t("actionFailed"),
    onSuccess: closeResolvedReview,
  });
  const isPending = keepMutation.isPending || discardMutation.isPending;
  const data = reviewQuery.data;
  const canAct = data != null && !reviewQuery.isError && !reviewQuery.isFetching && !isPending;
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
        <SourceDocumentReviewDialogContent
          isPending={isPending}
          isLoading={reviewQuery.isLoading}
          isReloading={reviewQuery.isFetching}
          loadingLabel={tReview("loading")}
          hasError={reviewQuery.isError || data == null}
          errorMessage={tReview("loadError")}
          reloadLabel={tReview("reload")}
          onReload={() => void reviewQuery.refetch()}
          header={
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
          }
          footer={
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                {tCommon("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (revisionId == null) return;
                  setDiscardRevisionId(revisionId);
                  setDiscardConfirmOpen(true);
                }}
                disabled={!canAct}
              >
                {discardMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {t("discard")}
              </Button>
              <Button onClick={() => keepMutation.mutate()} disabled={!canAct}>
                {keepMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {t("keep")}
              </Button>
            </>
          }
          {...(onExitComplete === undefined ? {} : { onExitComplete })}
        >
          {data != null ? (
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
          ) : null}
        </SourceDocumentReviewDialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (isPending) return;
          setDiscardConfirmOpen(nextOpen);
          if (!nextOpen) setDiscardRevisionId(null);
        }}
        title={t("discardConfirmTitle")}
        description={t("discardConfirmDescription", {
          date: duplicateDate,
          amount: formatCurrencyAmount(duplicateSummary.total, mainCurrency, locale),
          count: data?.duplicate.entries.length ?? 0,
        })}
        confirmLabel={t("discard")}
        variant="destructive"
        onConfirm={async () => {
          if (!canAct) return false;
          if (revisionId !== discardRevisionId) {
            setDiscardConfirmOpen(false);
            setDiscardRevisionId(null);
            return false;
          }
          await discardMutation.mutateAsync();
          return true;
        }}
      />
    </>
  );
}
