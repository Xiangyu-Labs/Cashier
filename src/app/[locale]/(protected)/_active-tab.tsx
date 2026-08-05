import { Suspense } from "react";
import { getLocale, getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { redirect } from "@/i18n/routing";
import { resolveAuthenticatedHome } from "@/lib/request-cache";
import { UnauthorizedError } from "@/lib/errors";
import { parsePeriodFromSearchParams } from "@/lib/period-utils";
import { parseLedgerTab } from "@/modules/workspace/tabs";
import { pickMessages, FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import {
  getScopedLedgerSearchParams,
  readLedgerFilterParams,
} from "@/modules/workspace/ledger-url-params";
import { ActiveContent } from "./_active-content";
import { ActiveShell } from "./_active-shell";
import { LedgerStartupPreview } from "@/modules/workspace/ui/LedgerStartupPreview";
import { ledgerStartupCacheKey } from "@/modules/workspace/ledger-startup-cache-constants";
import { periodToDateRange } from "@/lib/period-utils";

interface ActiveTabProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export async function ActiveTab({ searchParams }: ActiveTabProps) {
  const localePromise = getLocale();
  const contextPromise = resolveAuthenticatedHome();
  const locale = await localePromise;
  const messagesPromise = getMessages({ locale });
  let context;
  try {
    context = await contextPromise;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect({ href: "/login", locale });
      return null;
    }
    throw error;
  }

  const { ledgerId, ledgerDto, session } = context;

  const activeTab = parseLedgerTab(searchParams);
  const filterScope = activeTab === "details" ? "details" : "stream";
  const urlSearchParams = toUrlSearchParams(searchParams);
  const periodParams = parsePeriodFromSearchParams(
    getScopedLedgerSearchParams(urlSearchParams, filterScope)
  );
  const advancedFilters = readLedgerFilterParams(urlSearchParams, filterScope);
  const dateRange = periodToDateRange(periodParams, ledgerDto.settings.timeZone ?? undefined);

  const allMessages = await messagesPromise;
  const activeFeature =
    activeTab === "details"
      ? "details"
      : activeTab === "stats"
        ? "stats"
        : activeTab === "settings"
          ? "settings"
          : "stream";
  const activeMessages = pickMessages(allMessages, [
    ...FEATURE_MESSAGES.shell,
    ...FEATURE_MESSAGES[activeFeature],
  ]);

  return (
    <NextIntlClientProvider messages={activeMessages} locale={locale}>
      <ActiveShell ledgerId={ledgerId}>
        {/*
         * Inner Suspense wraps only the tab content that depends on
         * getLedgerPageBootstrap. The shell (AppShell, Header,
         * TabNavigation) is inside ActiveShell and renders immediately.
         */}
        <Suspense
          fallback={
            <LedgerStartupPreview
              snapshotKey={ledgerStartupCacheKey(ledgerDto.userId, ledgerId)}
              activeTab={activeTab}
              initialFilters={{
                ...advancedFilters,
                ...(dateRange.startDate != null ? { startDate: dateRange.startDate } : {}),
                ...(dateRange.endDate != null ? { endDate: dateRange.endDate } : {}),
              }}
            />
          }
        >
          <ActiveContent
            ledgerId={ledgerId}
            ledgerDto={ledgerDto}
            initialTab={activeTab}
            periodParams={periodParams}
            advancedFilters={advancedFilters}
            {...(session.user?.email != null ? { userEmail: session.user.email } : {})}
            hasPassword={session.user?.hasPassword ?? false}
            passwordUpdatedAt={session.user?.passwordUpdatedAt ?? null}
            interfaceLanguage={session.user?.interfaceLanguage ?? "auto"}
            locale={locale}
          />
        </Suspense>
      </ActiveShell>
    </NextIntlClientProvider>
  );
}

function toUrlSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => result.append(key, item));
    else if (value != null) result.set(key, value);
  }
  return result;
}
