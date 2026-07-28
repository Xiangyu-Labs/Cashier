"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/routing";
import type { InterfaceLanguage } from "@/modules/auth/contracts";

export function LocalePreferenceSync({ preference }: { preference: InterfaceLanguage }) {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (preference === "auto" || preference === locale) return;
    const query = searchParams.toString();
    router.replace(`${pathname}${query === "" ? "" : `?${query}`}`, {
      locale: preference,
    });
  }, [locale, pathname, preference, router, searchParams]);

  return null;
}
