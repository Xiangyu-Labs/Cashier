import { getLocale, getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { Providers } from "@/components/providers";
import { AppShell } from "@/modules/workspace/ui/AppShell";
import { OfflineNavigation } from "@/modules/offline/OfflineNavigation";
import { OfflineLedgerView } from "@/modules/offline/OfflineLedgerView";
import { FEATURE_MESSAGES, pickMessages } from "@/i18n/client-feature-messages";

export default async function OfflinePage() {
  const locale = await getLocale();
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, [...FEATURE_MESSAGES.shell, ...FEATURE_MESSAGES.stream])}
    >
      <Providers>
        <AppShell navigation={<OfflineNavigation />}>
          <OfflineLedgerView />
        </AppShell>
      </Providers>
    </NextIntlClientProvider>
  );
}
