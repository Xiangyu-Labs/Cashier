import { getLocale, getTranslations } from "next-intl/server";
import { listAdminServiceCredentials } from "@/modules/admin/queries";
import { AdminServiceCredentialsList } from "@/modules/admin/ui";

interface AdminServiceCredentialsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminServiceCredentialsPage({
  searchParams,
}: AdminServiceCredentialsPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminServiceCredentials");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedCredentialId = getSingleSearchParam(resolvedSearchParams.detail);
  const credentials = await listAdminServiceCredentials(listSearchParams);

  return (
    <AdminServiceCredentialsList
      locale={locale}
      items={credentials.items}
      hasAnyServiceCredentials={credentials.hasAnyServiceCredentials}
      nextCursor={credentials.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor) ?? null}
      expandedCredentialId={expandedCredentialId ?? null}
      labels={{
        title: t("title"),
        description: t("description"),
        id: t("id"),
        key: t("key"),
        name: t("name"),
        ledgerId: t("ledgerId"),
        user: t("user"),
        createdAt: t("createdAt"),
        lastUsedAt: t("lastUsedAt"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        notAvailable: t("notAvailable"),
      }}
    />
  );
}
