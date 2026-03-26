import { getTranslations } from "next-intl/server";
import {
  getAdminSourceDocumentDetail,
  listAdminSourceDocuments,
} from "@/modules/admin/queries";

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

  return (
    <div className="space-y-4">
      <h2>{t("title")}</h2>
      <ul>
        {result.items.map((item: { id: string; title: string | null; userEmail: string | null }) => (
          <li key={item.id}>
            <span>{item.title ?? item.id}</span>
            <span>{item.userEmail}</span>
          </li>
        ))}
      </ul>
      {detail != null ? <div>{t("sourceDocumentId")}</div> : null}
    </div>
  );
}
