import { HydrationBoundary } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { LedgerPageClient } from "@/modules/workspace/ui/LedgerPageClient";
import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import type { LedgerTab } from "@/modules/workspace/tabs";
import type { LedgerDto } from "@/modules/ledger/contracts";
import type { PeriodParams } from "@/lib/period-utils";
import type { InterfaceLanguage } from "@/modules/auth/contracts";

interface ActiveContentProps {
  ledgerId: string;
  ledgerDto: LedgerDto;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
  advancedFilters: LedgerAdvancedFilters;
  userEmail?: string;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  interfaceLanguage?: InterfaceLanguage;
  locale: string;
}

export async function ActiveContent({
  ledgerId,
  ledgerDto,
  initialTab,
  periodParams,
  advancedFilters,
  userEmail,
  hasPassword,
  passwordUpdatedAt,
  interfaceLanguage,
  locale,
}: ActiveContentProps) {
  const pageData = await getLedgerPageBootstrap({
    ledgerId,
    initialTab,
    periodParams,
    advancedFilters,
    ledgerDto,
  });

  if (pageData == null) {
    const t = await getTranslations({ locale, namespace: "LedgerPage" });
    const message = t("notFound");
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <p className="text-muted">{message}</p>
      </div>
    );
  }

  return (
    <HydrationBoundary state={pageData.dehydratedState}>
      <LedgerPageClient
        ledgerId={ledgerId}
        userId={ledgerDto.userId}
        initialTab={initialTab}
        initialPeriod={periodParams}
        initialStatsDate={pageData.initialStatsDate}
        {...(userEmail !== undefined ? { userEmail } : {})}
        {...(hasPassword !== undefined ? { hasPassword } : {})}
        {...(passwordUpdatedAt !== undefined ? { passwordUpdatedAt } : {})}
        {...(interfaceLanguage !== undefined ? { interfaceLanguage } : {})}
      />
    </HydrationBoundary>
  );
}
