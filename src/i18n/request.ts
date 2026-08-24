import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { resolveSupportedLocale } from "./resolve-locale";

export default getRequestConfig(async ({ requestLocale }) => {
  const explicitLocale = await requestLocale;
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value ?? null;

  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");

  const locale = resolveSupportedLocale({
    ...(explicitLocale === undefined ? {} : { explicitLocale }),
    cookieLocale,
    acceptLanguage,
  });

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
