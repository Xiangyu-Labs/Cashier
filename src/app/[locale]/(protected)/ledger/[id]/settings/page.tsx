import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import {
  getLedgerAction,
  getEntryCategoriesAction,
  getLedgerSettingsAction,
} from "@/modules/ledger/actions";
import { SettingsPageClient } from "@/modules/ledger/ui";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER } from "@/lib/constants";
import { pickMessages, FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import { auth } from "@/auth";

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { id: ledgerId } = await params;
  const locale = await getLocale();
  const queryClient = new QueryClient();
  const session = await auth();

  const STALE_TIME = LEDGER.STALE_TIME_MS;

  // Prefetch ledger data
  const ledger = await queryClient.fetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
  });

  if (!ledger) {
    const t = await getTranslations({ locale, namespace: "LedgerPage" });
    return <div>{t("notFound")}</div>;
  }

  // Prefetch categories
  const categories = await queryClient.fetchQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    staleTime: STALE_TIME,
  });

  // Prefetch ledger settings (credentials and uncategorized count)
  await queryClient.prefetchQuery({
    queryKey: queryKeys.ledgerSettings(ledgerId),
    queryFn: () => getLedgerSettingsAction(ledgerId),
    staleTime: STALE_TIME,
  });

  const allMessages = await getMessages({ locale });
  const settingsMessages = pickMessages(allMessages, [
    ...FEATURE_MESSAGES.shell,
    ...FEATURE_MESSAGES.settings,
  ]);

  return (
    <NextIntlClientProvider messages={settingsMessages} locale={locale}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <SettingsPageClient
          ledger={ledger}
          initialCategories={categories}
          ledgerId={ledgerId}
          {...(session?.user?.email != null ? { userEmail: session.user.email } : {})}
          {...(session?.user != null ? { hasPassword: session.user.hasPassword } : {})}
          {...(session?.user != null ? { passwordUpdatedAt: session.user.passwordUpdatedAt } : {})}
          {...(session?.user != null
            ? { interfaceLanguage: session.user.interfaceLanguage }
            : {})}
        />
      </HydrationBoundary>
    </NextIntlClientProvider>
  );
}
