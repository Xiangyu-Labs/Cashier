import { getTranslations } from "next-intl/server";
import { getAdminEntryDetail, listAdminEntries } from "@/modules/admin/queries";

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

  return (
    <div className="space-y-4">
      <h2>{t("title")}</h2>
      <ul>
        {result.items.map((item: { id: string; itemName: string; userEmail: string | null }) => (
          <li key={item.id}>
            <span>{item.itemName}</span>
            <span>{item.userEmail}</span>
          </li>
        ))}
      </ul>
      {detail != null ? <div>{t("entryId")}</div> : null}
    </div>
  );
}
