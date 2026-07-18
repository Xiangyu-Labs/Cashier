"use client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentCountsAction } from "@/modules/source-document/actions";

interface HeaderProps {
  ledgerId: string;
  onOpenInput: () => void;
}

export function Header({ ledgerId, onOpenInput }: HeaderProps) {
  const t = useTranslations("LedgerPage");

  const { data: counts } = useQuery({
    queryKey: queryKeys.sourceDocumentCounts(ledgerId),
    queryFn: () => getSourceDocumentCountsAction(ledgerId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const processingCount = counts?.processingCount ?? 0;
  const attentionCount = counts?.attentionCount ?? 0;
  const totalBadgeCount = processingCount + attentionCount;

  return (
    <header className="sticky top-0 z-header border-b border-border bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text">Cashier</span>
          {totalBadgeCount > 0 && (
            <div className="flex items-center gap-1.5">
              {processingCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {processingCount}
                </span>
              )}
              {attentionCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {attentionCount}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={onOpenInput}
          className="h-9 w-9 rounded-md p-0"
          aria-label={t("newRecord")}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
