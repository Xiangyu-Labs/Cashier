import { Suspense } from "react";
import { getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { redirect } from "@/i18n/routing";
import { resolveAuthenticatedHome } from "@/lib/request-cache";
import { parsePeriodFromSearchParams } from "@/lib/period-utils";
import { parseLedgerTab } from "@/modules/workspace/tabs";
import { EntriesTabSkeleton } from "@/components/skeletons/TabSkeletons";
import { pickMessages, FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import { ActiveContent } from "./_active-content";

interface ActiveTabProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export async function ActiveTab({ searchParams }: ActiveTabProps) {
  let context;
  try {
    context = await resolveAuthenticatedHome();
  } catch {
    // Auth failure — redirect to login.
    // resolveAuthenticatedHome throws UnauthorizedError; the layout's
    // own auth() check should catch this first, but handle it here
    // for safety.
    redirect({ href: "/login", locale: "en" });
    return null;
  }

  const { ledgerId, ledgerDto, session, locale } = context;

  const initialTab = parseLedgerTab(searchParams);
  const periodParams = parsePeriodFromSearchParams(searchParams);
  const advancedFilters = readAdvancedFilters(searchParams);

  const allMessages = await getMessages({ locale });
  const streamMessages = pickMessages(allMessages, [
    ...FEATURE_MESSAGES.shell,
    ...FEATURE_MESSAGES.stream,
  ]);

  return (
    <NextIntlClientProvider messages={streamMessages} locale={locale}>
      {/*
       * Render a minimal page frame (background) immediately after
       * auth/home resolve, so the outer Suspense in page.tsx can
       * stream this HTML to the browser before the heavy bootstrap
       * queries complete.
       *
       * The full AppShell (with navigation header) is rendered by
       * LedgerPageClient once ActiveContent resolves inside the
       * inner Suspense.
       */}
      <div className="min-h-dvh bg-bg text-text">
        <main className="mx-auto w-full max-w-6xl px-3 py-4 pb-24 sm:px-4 md:px-6">
          <Suspense fallback={<EntriesTabSkeleton />}>
            <ActiveContent
              ledgerId={ledgerId}
              ledgerDto={ledgerDto}
              initialTab={initialTab}
              periodParams={periodParams}
              advancedFilters={advancedFilters}
              {...(session.user?.email != null ? { userEmail: session.user.email } : {})}
              locale={locale}
            />
          </Suspense>
        </main>
      </div>
    </NextIntlClientProvider>
  );
}

function readAdvancedFilters(searchParams: Record<string, string | string[] | undefined>) {
  const getSingleSearchParam = (
    value: string | string[] | undefined
  ): string | undefined => {
    return Array.isArray(value) ? value[0] : value;
  };

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
