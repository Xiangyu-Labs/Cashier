import { Suspense } from "react";
import { getLocale, getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { redirect } from "@/i18n/routing";
import { resolveAuthenticatedHome } from "@/lib/request-cache";
import { UnauthorizedError } from "@/lib/errors";
import { parsePeriodFromSearchParams } from "@/lib/period-utils";
import { parseLedgerTab } from "@/modules/workspace/tabs";
import { EntriesTabSkeleton } from "@/components/skeletons/TabSkeletons";
import { pickMessages, FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import { ActiveContent } from "./_active-content";
import { ActiveShell } from "./_active-shell";

interface ActiveTabProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export async function ActiveTab({ searchParams }: ActiveTabProps) {
  const locale = await getLocale();
  let context;
  try {
    context = await resolveAuthenticatedHome();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect({ href: "/login", locale });
      return null;
    }
    throw error;
  }

  const { ledgerId, ledgerDto, session } = context;

  const periodParams = parsePeriodFromSearchParams(searchParams);
  const advancedFilters = readAdvancedFilters(searchParams);

  const allMessages = await getMessages({ locale });
  const streamMessages = pickMessages(allMessages, [
    ...FEATURE_MESSAGES.shell,
    ...FEATURE_MESSAGES.stream,
  ]);

  return (
    <NextIntlClientProvider messages={streamMessages} locale={locale}>
      <ActiveShell ledgerId={ledgerId}>
        {/*
         * Inner Suspense wraps only the tab content that depends on
         * getLedgerPageBootstrap. The shell (AppShell, Header,
         * TabNavigation) is inside ActiveShell and renders immediately.
         */}
        <Suspense fallback={<EntriesTabSkeleton />}>
          <ActiveContent
            ledgerId={ledgerId}
            ledgerDto={ledgerDto}
            initialTab={parseLedgerTab(searchParams)}
            periodParams={periodParams}
            advancedFilters={advancedFilters}
            {...(session.user?.email != null ? { userEmail: session.user.email } : {})}
            locale={locale}
          />
        </Suspense>
      </ActiveShell>
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

  // I2: Include statuses from searchParams for filter membership coherence
  const rawStatuses = getSingleSearchParam(searchParams.statuses);
  const statuses: SourceDocumentStatusType[] | undefined = rawStatuses != null && rawStatuses !== ""
    ? (rawStatuses.split(",").map((s) => s.trim()).filter(Boolean) as SourceDocumentStatusType[])
    : undefined;

  return {
    categoryId: getSingleSearchParam(searchParams.categoryId) ?? null,
    currency: getSingleSearchParam(searchParams.currency) ?? null,
    minAmount: readNumber("minAmount"),
    maxAmount: readNumber("maxAmount"),
    ...(statuses != null && statuses.length > 0 ? { statuses } : {}),
  };
}
