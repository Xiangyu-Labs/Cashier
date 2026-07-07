import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";

interface LegacyLedgerPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function appendSearchParams(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    if (value != null) {
      params.set(key, value);
    }
  });

  const queryString = params.toString();
  return queryString === "" ? "" : `?${queryString}`;
}

export default async function LegacyLedgerPage({ searchParams }: LegacyLedgerPageProps) {
  const locale = await getLocale();
  const resolvedSearchParams = await searchParams;

  redirect({
    href: `/${appendSearchParams(resolvedSearchParams)}`,
    locale,
  });
}
