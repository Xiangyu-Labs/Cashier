import { Suspense, type ReactNode } from "react";
import { redirect } from "@/i18n/routing";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { LedgerPageClient } from "@/modules/workspace/ui";
import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";
import { parseLedgerTab } from "@/modules/workspace/tabs";
import { parsePeriodFromSearchParams } from "@/lib/period-utils";
import { LedgerPageSkeleton } from "@/components/skeletons";
import { HydrationBoundary } from "@tanstack/react-query";
import { resolveHome } from "@/modules/workspace/application/use-cases/resolve-home";

export const maxDuration = 120;

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readAdvancedFilters(searchParams: Record<string, string | string[] | undefined>) {
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

export default async function HomePage({ searchParams }: HomePageProps): Promise<ReactNode> {
  const [session, locale, t, resolvedSearchParams] = await Promise.all([
    auth(),
    getLocale(),
    getTranslations("HomePage"),
    searchParams,
  ]);

  if (session?.user?.id == null) {
    redirect({ href: "/login", locale });
  }

  if (session?.user?.id == null) return null;

  let home;
  try {
    home = await resolveHome({
      userId: session.user.id,
      locale,
    });
  } catch (error) {
    console.error("Failed to initialize single ledger:", error);
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="text-center">
          <p className="mt-4 text-muted">{t("createFailed")}</p>
        </div>
      </div>
    );
  }

  const periodParams = parsePeriodFromSearchParams(resolvedSearchParams);
  const advancedFilters = readAdvancedFilters(resolvedSearchParams);
  const initialTab = parseLedgerTab(resolvedSearchParams);
  const pageData = await getLedgerPageBootstrap({
    ledgerId: home.ledgerId,
    initialTab,
    periodParams,
    advancedFilters,
  });

  if (pageData == null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <p className="text-muted">{t("createFailed")}</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<LedgerPageSkeleton activeTab={initialTab} />}>
      <HydrationBoundary state={pageData.dehydratedState}>
        <LedgerPageClient
          ledgerId={home.ledgerId}
          initialTab={initialTab}
          initialPeriod={periodParams}
          initialStatsDate={pageData.initialStatsDate}
        />
      </HydrationBoundary>
    </Suspense>
  );
}
