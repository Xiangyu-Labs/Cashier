import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { resolveSupportedLocale } from "./resolve-locale";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");

  const locale = resolveSupportedLocale({ cookieLocale, acceptLanguage });

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
