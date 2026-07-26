import { Inter } from "next/font/google";
import "../globals.css";
import { routing } from "@/i18n/routing";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pickMessages, FEATURE_MESSAGES } from "@/i18n/client-feature-messages";

function validateLocale(locale: string) {
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return locale;
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap", // Use swap to prevent FOIT (Flash of Invisible Text)
  preload: true,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = validateLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Cashier",
    },
  };
}

export const viewport = {
  themeColor: "#10a37f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevent zooming on mobile for app-like feel
  viewportFit: "cover", // Ensure content extends to edges including notches
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>): Promise<React.ReactNode> {
  const locale = validateLocale((await params).locale);

  // Load only shell namespaces for the global layout.
  // Protected feature namespaces are loaded by child providers.
  const allMessages = await getMessages({ locale });
  const shellMessages = pickMessages(allMessages, FEATURE_MESSAGES.shell);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`} style={{ backgroundColor: "var(--bg)" }}>
        <NextIntlClientProvider messages={shellMessages} locale={locale}>
          <main className="max-w-screen-2xl mx-auto min-h-screen pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
