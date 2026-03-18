import { Suspense } from "react";
import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { HydrationBoundary } from "@tanstack/react-query";
import { parsePeriodFromSearchParams, type PeriodParams } from "@/lib/period-utils";
import { LedgerPageSkeleton } from "@/components/skeletons";
import { parseLedgerTab, type LedgerTab } from "@/features/ledger";
import { prepareLedgerPageData } from "@/features/ledger/server";

interface LedgerPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface LedgerPageContentProps {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
}

async function LedgerPageContent({
  ledgerId,
  initialTab,
  periodParams,
}: LedgerPageContentProps) {
  const t = await getTranslations("LedgerPage");
  const pageData = await prepareLedgerPageData({
    ledgerId,
    initialTab,
    periodParams,
  });

  if (pageData == null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <HydrationBoundary state={pageData.dehydratedState}>
      <LedgerPageClient
        ledgerId={ledgerId}
        initialTab={initialTab}
        initialPeriod={periodParams}
        initialStatsDate={pageData.initialStatsDate}
      />
    </HydrationBoundary>
  );
}

export default async function LedgerPage({ params, searchParams }: LedgerPageProps) {
  const { id: ledgerId } = await params;
  const resolvedSearchParams = await searchParams;
  const periodParams = parsePeriodFromSearchParams(resolvedSearchParams);
  const initialTab = parseLedgerTab(resolvedSearchParams);
  const session = await auth();

  if (session?.user?.id == null) {
    redirect({ href: "/login", locale: "en" });
  }

  return (
    <Suspense fallback={<LedgerPageSkeleton activeTab={initialTab} />}>
      <LedgerPageContent ledgerId={ledgerId} initialTab={initialTab} periodParams={periodParams} />
    </Suspense>
  );
}
