import { getLocale, getTranslations } from "next-intl/server";
import {
  getAdminSourceDocumentDetail,
  listAdminSourceDocuments,
} from "@/modules/admin/queries";
import {
  AdminSourceDocumentFilters,
  AdminSourceDocumentsList,
  type AdminSourceDocumentFiltersState,
} from "@/modules/admin/ui";

interface AdminSourceDocumentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function AdminSourceDocumentsPage({
  searchParams,
}: AdminSourceDocumentsPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminSourceDocuments");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    status: getSingleSearchParam(resolvedSearchParams.status),
    type: getSingleSearchParam(resolvedSearchParams.type),
    range: getSingleSearchParam(resolvedSearchParams.range),
    result: getSingleSearchParam(resolvedSearchParams.result),
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const selectedSourceDocumentId = getSingleSearchParam(resolvedSearchParams.detail);
  const result = await listAdminSourceDocuments(listSearchParams);
  const detail =
    selectedSourceDocumentId != null
      ? await getAdminSourceDocumentDetail(selectedSourceDocumentId)
      : null;

  const filters: AdminSourceDocumentFiltersState = {
    ...(listSearchParams.status != null
      ? { status: listSearchParams.status as NonNullable<AdminSourceDocumentFiltersState["status"]> }
      : {}),
    ...(listSearchParams.type != null
      ? { type: listSearchParams.type as NonNullable<AdminSourceDocumentFiltersState["type"]> }
      : {}),
    range: (listSearchParams.range as AdminSourceDocumentFiltersState["range"] | undefined) ?? "all",
    result:
      (listSearchParams.result as AdminSourceDocumentFiltersState["result"] | undefined) ?? "all",
    ...(listSearchParams.limit != null ? { limit: listSearchParams.limit } : {}),
  };

  return (
    <div className="space-y-4">
      <AdminSourceDocumentFilters
        availableTypes={result.availableTypes}
        filters={filters}
        labels={{
          status: t("status"),
          type: t("type"),
          range: t("range"),
          result: t("result"),
          allStatuses: t("allStatuses"),
          allTypes: t("allTypes"),
          allResults: t("allResults"),
          statusQueued: t("statusQueued"),
          statusProcessing: t("statusProcessing"),
          statusCompleted: t("statusCompleted"),
          statusAnomaly: t("statusAnomaly"),
          statusFailed: t("statusFailed"),
          statusDeleted: t("statusDeleted"),
          range24h: t("range24h"),
          range7d: t("range7d"),
          range30d: t("range30d"),
          rangeAll: t("rangeAll"),
          resultWithEntries: t("resultWithEntries"),
          resultWithoutEntries: t("resultWithoutEntries"),
          resetFilters: t("resetFilters"),
        }}
      />

      <AdminSourceDocumentsList
        locale={locale}
        items={result.items}
        hasAnySourceDocuments={result.hasAnySourceDocuments}
        nextCursor={result.nextCursor}
        filters={filters}
        {...(listSearchParams.cursor != null ? { currentCursor: listSearchParams.cursor } : {})}
        {...(selectedSourceDocumentId != null ? { expandedSourceDocumentId: selectedSourceDocumentId } : {})}
        {...(detail != null ? { expandedSourceDocumentDetail: detail } : {})}
        labels={{
          title: t("title"),
          description: t("description"),
          createdAt: t("createdAt"),
          status: t("status"),
          type: t("type"),
          user: t("user"),
          sourceDocument: t("sourceDocument"),
          results: t("results"),
          entryCount: t("entryCount"),
          entryDate: t("entryDate"),
          details: t("details"),
          detailsColumn: t("detailsColumn"),
          hideDetails: t("hideDetails"),
          emptyTitle: t("emptyTitle"),
          emptyDescription: t("emptyDescription"),
          filteredEmptyTitle: t("filteredEmptyTitle"),
          filteredEmptyDescription: t("filteredEmptyDescription"),
          nextPage: t("nextPage"),
          documentBasics: t("documentBasics"),
          ledgerAndResults: t("ledgerAndResults"),
          content: t("content"),
          timing: t("timing"),
          rawData: t("rawData"),
          showRawData: t("showRawData"),
          hideRawData: t("hideRawData"),
          sourceDocumentId: t("sourceDocumentId"),
          ledgerId: t("ledgerId"),
          userEmail: t("userEmail"),
          titleLabel: t("titleLabel"),
          text: t("text"),
          anomalyReason: t("anomalyReason"),
          metadata: t("metadata"),
          imageUrls: t("imageUrls"),
          updatedAt: t("updatedAt"),
          deletedAt: t("deletedAt"),
          notAvailable: t("notAvailable"),
          statusQueued: t("statusQueued"),
          statusProcessing: t("statusProcessing"),
          statusCompleted: t("statusCompleted"),
          statusAnomaly: t("statusAnomaly"),
          statusFailed: t("statusFailed"),
          statusDeleted: t("statusDeleted"),
        }}
      />
    </div>
  );
}
