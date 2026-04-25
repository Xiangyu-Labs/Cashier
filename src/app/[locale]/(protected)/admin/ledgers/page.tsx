import { getLocale, getTranslations } from "next-intl/server";
import { listAdminLedgers } from "@/modules/admin/queries";
import { AdminLedgersList } from "@/modules/admin/ui";

interface AdminLedgersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminLedgersPage({ searchParams }: AdminLedgersPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminLedgers");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    range: getSingleSearchParam(resolvedSearchParams.range),
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedLedgerId = getSingleSearchParam(resolvedSearchParams.detail);
  const ledgers = await listAdminLedgers(listSearchParams);

  return (
    <AdminLedgersList
      locale={locale}
      items={ledgers.items}
      hasAnyLedgers={ledgers.hasAnyLedgers}
      nextCursor={ledgers.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor)}
      expandedLedgerId={expandedLedgerId}
      labels={{
        title: t("title"),
        description: t("description"),
        id: t("id"),
        user: t("user"),
        createdAt: t("createdAt"),
        mainCurrency: t("mainCurrency"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        notAvailable: t("notAvailable"),
        ledgerId: t("ledgerId"),
        userId: t("userId"),
        userEmail: t("userEmail"),
        metadata: t("metadata"),
        updatedAt: t("updatedAt"),
        deletedAt: t("deletedAt"),
        showRawData: t("showRawData"),
        hideRawData: t("hideRawData"),
      }}
    />
  );
}
