import { Suspense } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import { getLocale, getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { auth } from "@/auth";
import { redirect } from "@/i18n/routing";
import { LedgerPageClient } from "@/modules/workspace/ui/LedgerPageClient";
import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";
import { resolveHome } from "@/modules/workspace/application/use-cases/resolve-home";
import { parsePeriodFromSearchParams } from "@/lib/period-utils";
import { parseLedgerTab } from "@/modules/workspace/tabs";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { LedgerPageSkeleton } from "@/components/skeletons";
import { pickMessages, FEATURE_MESSAGES } from "@/i18n/client-feature-messages";

interface ActiveTabProps {
  searchParams: Record<string, string | string[] | undefined>;
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

export async function ActiveTab({ searchParams }: ActiveTabProps) {
  const [session, locale] = await Promise.all([auth(), getLocale()]);

  if (session?.user?.id == null) {
    redirect({ href: "/login", locale });
    // Unreachable — redirect either navigates away or throws.
    // This null return satisfies TypeScript control flow analysis.
    return null;
  }

  const initialTab = parseLedgerTab(searchParams);
  const periodParams = parsePeriodFromSearchParams(searchParams);
  const advancedFilters = readAdvancedFilters(searchParams);

  const home = await resolveHome({
    userId: session.user.id,
    locale,
  });

  const pageData = await getLedgerPageBootstrap({
    ledgerId: home.ledgerId,
    initialTab,
    periodParams,
    advancedFilters,
  });

  if (pageData == null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <p className="text-muted">Failed to load ledger data.</p>
      </div>
    );
  }

  // Load Stream-related messages on top of the shell messages from the global layout
  const allMessages = await getMessages({ locale });
  const streamMessages = pickMessages(allMessages, [
    ...FEATURE_MESSAGES.shell,
    ...FEATURE_MESSAGES.stream,
  ]);

  return (
    <NextIntlClientProvider messages={streamMessages} locale={locale}>
      <HydrationBoundary state={pageData.dehydratedState}>
        <LedgerPageClient
          ledgerId={home.ledgerId}
          initialTab={initialTab}
          initialPeriod={periodParams}
          initialStatsDate={pageData.initialStatsDate}
        />
      </HydrationBoundary>
    </NextIntlClientProvider>
  );
}
