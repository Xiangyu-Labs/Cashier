import { Suspense } from "react";
import { auth } from "@/auth";
import { LedgerPageClient } from "@/modules/workspace/ui";
import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";
import { parseLedgerTab, type LedgerTab } from "@/modules/workspace/tabs";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { HydrationBoundary } from "@tanstack/react-query";
import { parsePeriodFromSearchParams, type PeriodParams } from "@/lib/period-utils";
import { LedgerPageSkeleton } from "@/components/skeletons";

interface LedgerPageAdvancedFilters {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
}

interface LedgerPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface LedgerPageContentProps {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
  advancedFilters: LedgerPageAdvancedFilters;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function readAdvancedFilters(
  searchParams: Record<string, string | string[] | undefined>
): LedgerPageAdvancedFilters {
  const readNumber = (key: "minAmount" | "maxAmount"): number | null => {
    const raw = getSingleSearchParam(searchParams[key]);
    if (raw == null) return null;

    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return {
    categoryId: getSingleSearchParam(searchParams.categoryId) ?? null,
    currency: getSingleSearchParam(searchParams.currency) ?? null,
    minAmount: readNumber("minAmount"),
    maxAmount: readNumber("maxAmount"),
  };
}

async function LedgerPageContent({
  ledgerId,
  initialTab,
  periodParams,
  advancedFilters,
}: LedgerPageContentProps) {
  const t = await getTranslations("LedgerPage");
  const pageData = await getLedgerPageBootstrap({
    ledgerId,
    initialTab,
    periodParams,
    advancedFilters,
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
  const advancedFilters = readAdvancedFilters(resolvedSearchParams);
  const initialTab = parseLedgerTab(resolvedSearchParams);
  const session = await auth();
  const locale = await getLocale();

  if (session?.user?.id == null) {
    redirect({ href: "/login", locale });
  }

  return (
    <Suspense fallback={<LedgerPageSkeleton activeTab={initialTab} />}>
      <LedgerPageContent
        ledgerId={ledgerId}
        initialTab={initialTab}
        periodParams={periodParams}
        advancedFilters={advancedFilters}
      />
    </Suspense>
  );
}
