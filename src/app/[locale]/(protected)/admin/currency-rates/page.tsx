import { getLocale, getTranslations } from "next-intl/server";
import { listAdminCurrencyRates } from "@/modules/admin/queries";
import { AdminCurrencyRatesList } from "@/modules/admin/ui";

interface AdminCurrencyRatesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminCurrencyRatesPage({ searchParams }: AdminCurrencyRatesPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminCurrencyRates");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    range: getSingleSearchParam(resolvedSearchParams.range),
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedDate = getSingleSearchParam(resolvedSearchParams.detail);
  const rates = await listAdminCurrencyRates(listSearchParams);

  return (
    <AdminCurrencyRatesList
      locale={locale}
      items={rates.items}
      hasAnyCurrencyRates={rates.hasAnyCurrencyRates}
      nextCursor={rates.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor)}
      expandedDate={expandedDate}
      labels={{
        title: t("title"),
        description: t("description"),
        date: t("date"),
        base: t("base"),
        rateCount: t("rateCount"),
        updatedAt: t("updatedAt"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        rates: t("rates"),
        showRawData: t("showRawData"),
        hideRawData: t("hideRawData"),
        notAvailable: t("notAvailable"),
      }}
    />
  );
}
