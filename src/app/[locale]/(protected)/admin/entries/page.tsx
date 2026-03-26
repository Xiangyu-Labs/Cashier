import { getLocale, getTranslations } from "next-intl/server";
import { getAdminEntryDetail, listAdminEntries } from "@/modules/admin/queries";
import { AdminEntriesList, AdminEntryFilters, type AdminEntryFiltersState } from "@/modules/admin/ui";

interface AdminEntriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function AdminEntriesPage({ searchParams }: AdminEntriesPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminEntries");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    range: getSingleSearchParam(resolvedSearchParams.range),
    currency: getSingleSearchParam(resolvedSearchParams.currency),
    categoryId: getSingleSearchParam(resolvedSearchParams.categoryId),
    sourceLink: getSingleSearchParam(resolvedSearchParams.sourceLink),
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const selectedEntryId = getSingleSearchParam(resolvedSearchParams.detail);
  const result = await listAdminEntries(listSearchParams);
  const detail = selectedEntryId != null ? await getAdminEntryDetail(selectedEntryId) : null;

  const filters: AdminEntryFiltersState = {
    range: (listSearchParams.range as AdminEntryFiltersState["range"] | undefined) ?? "all",
    ...(listSearchParams.currency != null ? { currency: listSearchParams.currency } : {}),
    ...(listSearchParams.categoryId != null ? { categoryId: listSearchParams.categoryId } : {}),
    sourceLink:
      (listSearchParams.sourceLink as AdminEntryFiltersState["sourceLink"] | undefined) ?? "all",
    ...(listSearchParams.limit != null ? { limit: listSearchParams.limit } : {}),
  };

  return (
    <div className="space-y-4">
      <AdminEntryFilters
        availableCurrencies={result.availableCurrencies}
        availableCategories={result.availableCategories}
        filters={filters}
        labels={{
          range: t("range"),
          currency: t("currency"),
          category: t("category"),
          sourceLink: t("sourceLink"),
          allCurrencies: t("allCurrencies"),
          allCategories: t("allCategories"),
          allSourceLinks: t("allSourceLinks"),
          range24h: t("range24h"),
          range7d: t("range7d"),
          range30d: t("range30d"),
          rangeAll: t("rangeAll"),
          sourceLinked: t("sourceLinked"),
          sourceUnlinked: t("sourceUnlinked"),
          resetFilters: t("resetFilters"),
        }}
      />

      <AdminEntriesList
        locale={locale}
        items={result.items}
        hasAnyEntries={result.hasAnyEntries}
        nextCursor={result.nextCursor}
        filters={filters}
        {...(listSearchParams.cursor != null ? { currentCursor: listSearchParams.cursor } : {})}
        {...(selectedEntryId != null ? { expandedEntryId: selectedEntryId } : {})}
        {...(detail != null ? { expandedEntryDetail: detail } : {})}
        labels={{
          title: t("title"),
          description: t("description"),
          createdAt: t("createdAt"),
          user: t("user"),
          itemName: t("itemName"),
          amount: t("amount"),
          currency: t("currency"),
          category: t("category"),
          sourceDocument: t("sourceDocument"),
          details: t("details"),
          detailsColumn: t("detailsColumn"),
          hideDetails: t("hideDetails"),
          emptyTitle: t("emptyTitle"),
          emptyDescription: t("emptyDescription"),
          filteredEmptyTitle: t("filteredEmptyTitle"),
          filteredEmptyDescription: t("filteredEmptyDescription"),
          nextPage: t("nextPage"),
          entryBasics: t("entryBasics"),
          associations: t("associations"),
          amounts: t("amounts"),
          timing: t("timing"),
          entryId: t("entryId"),
          ledgerId: t("ledgerId"),
          userEmail: t("userEmail"),
          categoryId: t("categoryId"),
          categoryName: t("categoryName"),
          sourceDocumentId: t("sourceDocumentId"),
          sourceDocumentTitle: t("sourceDocumentTitle"),
          sourceDocumentStatus: t("sourceDocumentStatus"),
          descriptionLabel: t("descriptionLabel"),
          convertedAmount: t("convertedAmount"),
          exchangeRate: t("exchangeRate"),
          updatedAt: t("updatedAt"),
          deletedAt: t("deletedAt"),
          notAvailable: t("notAvailable"),
        }}
      />
    </div>
  );
}
