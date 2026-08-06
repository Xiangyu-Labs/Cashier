import { HydrationBoundary } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { SettingsPageClient } from "@/modules/ledger/ui";
import { pickMessages, FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import { auth } from "@/auth";
import { getLedgerSettingsBootstrap } from "@/modules/workspace/application/queries/get-ledger-settings-bootstrap";
import { scheduleProcessingRecoveryAfter } from "@/modules/source-document/server-actions/schedule-processing-recovery";
import { serverComposition } from "@/application/server-composition-root";

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { id: ledgerId } = await params;
  const [locale, session] = await Promise.all([getLocale(), auth()]);
  const userId = session?.user?.id;
  const ledger =
    userId == null || userId === ""
      ? null
      : await serverComposition.ledgers.getOwned(ledgerId, userId);

  if (!ledger) {
    const t = await getTranslations({ locale, namespace: "LedgerPage" });
    return <div>{t("notFound")}</div>;
  }

  scheduleProcessingRecoveryAfter(ledgerId);

  const pageData = await getLedgerSettingsBootstrap(
    {
      ledgerId,
      ledgerDto: ledger,
    },
    {
      categories: serverComposition.categories,
      credentials: serverComposition.serviceCredentials,
    }
  );
  if (pageData == null) {
    const t = await getTranslations({ locale, namespace: "LedgerPage" });
    return <div>{t("notFound")}</div>;
  }

  const allMessages = await getMessages({ locale });
  const settingsMessages = pickMessages(allMessages, [
    ...FEATURE_MESSAGES.shell,
    ...FEATURE_MESSAGES.settings,
  ]);

  return (
    <NextIntlClientProvider messages={settingsMessages} locale={locale}>
      <HydrationBoundary state={pageData.dehydratedState}>
        <SettingsPageClient
          ledger={ledger}
          initialCategories={pageData.initialCategories}
          ledgerId={ledgerId}
          {...(session?.user?.email != null ? { userEmail: session.user.email } : {})}
          {...(session?.user != null ? { hasPassword: session.user.hasPassword } : {})}
          {...(session?.user != null ? { passwordUpdatedAt: session.user.passwordUpdatedAt } : {})}
          {...(session?.user != null ? { interfaceLanguage: session.user.interfaceLanguage } : {})}
        />
      </HydrationBoundary>
    </NextIntlClientProvider>
  );
}
