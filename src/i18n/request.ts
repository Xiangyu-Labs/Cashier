import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { routing } from "./routing";

export default getRequestConfig(async () => {
  // 1. Try to get locale from cookies
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;

  // 2. Try to get locale from Accept-Language header (simplified)
  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");
  // Simple parse: take first 2 chars of first lang.
  // Real prod logic might use a parser, but for now strict match or default is fine.

  // Explicitly type locale
  let locale: (typeof routing.locales)[number] = routing.defaultLocale;

  if (localeCookie && (routing.locales as readonly string[]).includes(localeCookie)) {
    locale = localeCookie as (typeof routing.locales)[number];
  } else if (acceptLanguage) {
    // Very basic check. 'zh-CN' -> 'zh', 'en-US' -> 'en'
    if (acceptLanguage.includes("zh")) locale = "zh";
    else if (acceptLanguage.includes("en")) locale = "en";
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
