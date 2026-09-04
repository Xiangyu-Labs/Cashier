"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/CategoryIcon";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import { cn } from "@/lib/utils";
import { getSourceDocumentCandidateReviewAction } from "@/modules/source-document/actions";
import type {
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentCandidateReviewRevisionDto,
} from "@/modules/source-document/contracts";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";
import { SourceDocumentReviewDialogContent } from "./SourceDocumentReviewDialogContent";
import { queryKeys } from "@/lib/query-keys";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SourceDocumentReviewEntryAmount } from "./SourceDocumentReviewEntryAmount";

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
  const tReview = useTranslations("ReviewDialog");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false);
  const [abandonVersion, setAbandonVersion] = useState<number | null>(null);
  const reviewQueryKey = queryKeys.sourceDocumentCandidateReview(ledgerId, sourceDocumentId);
  const reviewQuery = useQuery({
    queryKey: reviewQueryKey,
    queryFn: () => getSourceDocumentCandidateReviewAction(ledgerId, sourceDocumentId),
    enabled: open,
    staleTime: 0,
  });
  const version = reviewQuery.data?.version ?? 1;
  const recovery = useSourceDocumentRecoveryMutations({
    ledgerId,
    sourceDocumentId,
    version,
    onSuccess: () => onOpenChange(false),
  });
  const isPending = recovery.isReviewing;
  const canAct =
    reviewQuery.data != null && !reviewQuery.isError && !reviewQuery.isFetching && !isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
        <SourceDocumentReviewDialogContent
          isPending={isPending}
          isLoading={reviewQuery.isLoading}
          isReloading={reviewQuery.isFetching}
          loadingLabel={tReview("loading")}
          hasError={reviewQuery.isError || reviewQuery.data == null}
          errorMessage={tReview("loadError")}
          reloadLabel={tReview("reload")}
          onReload={() => void reviewQuery.refetch()}
          header={
            <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
              <DialogTitle className="text-base">{t("title")}</DialogTitle>
            </DialogHeader>
          }
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (reviewQuery.data == null) return;
                  setAbandonVersion(version);
                  setAbandonConfirmOpen(true);
                }}
                disabled={!canAct}
              >
                {recovery.isAbandoning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("keepOriginal")}
              </Button>
              <Button onClick={() => recovery.acceptCandidate()} disabled={!canAct}>
                {recovery.isAccepting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {t("acceptCandidate")}
              </Button>
            </>
          }
        >
          {reviewQuery.data != null ? (
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <RevisionPanel
                revision={reviewQuery.data.active}
                label={t("original")}
                tone="original"
                mainCurrency={mainCurrency}
                locale={locale}
                emptyLabel={tReview("noEntries")}
                entryCountLabel={t("entryCount", { count: reviewQuery.data.active.entryCount })}
              />
              <RevisionPanel
                revision={reviewQuery.data.candidate}
                label={t("candidate")}
                tone="candidate"
                mainCurrency={mainCurrency}
                locale={locale}
                emptyLabel={tReview("noEntries")}
                entryCountLabel={t("entryCount", {
                  count: reviewQuery.data.candidate.entryCount,
                })}
              />
            </div>
          ) : null}
        </SourceDocumentReviewDialogContent>
      </Dialog>
      <ConfirmDialog
        open={abandonConfirmOpen && abandonVersion === version}
        onOpenChange={(nextOpen) => {
          if (isPending) return;
          setAbandonConfirmOpen(nextOpen);
          if (!nextOpen) setAbandonVersion(null);
        }}
        title={t("abandonConfirmTitle")}
        description={t("abandonConfirmDescription")}
        confirmLabel={t("keepOriginal")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          if (!canAct) return false;
          const currentVersion = queryClient.getQueryData<{ version: number }>(
            reviewQueryKey
          )?.version;
          if (version !== abandonVersion || currentVersion !== abandonVersion) {
            setAbandonConfirmOpen(false);
            setAbandonVersion(null);
            return false;
          }
          return recovery.abandonCandidate();
        }}
      />
    </>
  );
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
      <SourceDocumentReviewEntryAmount
        amount={entry.amount}
        currency={entry.currency}
        convertedAmount={entry.convertedAmount}
        mainCurrency={mainCurrency}
        locale={locale}
      />
    </div>
  );
}
