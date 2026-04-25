import { getTranslations } from "next-intl/server";
import { listAdminAccounts } from "@/modules/admin/queries";
import { AdminAccountsList } from "@/modules/admin/ui";

interface AdminAccountsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminAccountsPage({ searchParams }: AdminAccountsPageProps) {
  const t = await getTranslations("AdminAccounts");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    provider: getSingleSearchParam(resolvedSearchParams.provider),
  };

  const expandedAccountKey = getSingleSearchParam(resolvedSearchParams.detail);
  const accounts = await listAdminAccounts(listSearchParams);

  return (
    <AdminAccountsList
      items={accounts.items}
      hasAnyAccounts={accounts.hasAnyAccounts}
      expandedAccountKey={expandedAccountKey}
      labels={{
        title: t("title"),
        description: t("description"),
        provider: t("provider"),
        providerAccountId: t("providerAccountId"),
        type: t("type"),
        user: t("user"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        userId: t("userId"),
        userEmail: t("userEmail"),
        refreshToken: t("refreshToken"),
        accessToken: t("accessToken"),
        expiresAt: t("expiresAt"),
        tokenType: t("tokenType"),
        scope: t("scope"),
        idToken: t("idToken"),
        sessionState: t("sessionState"),
        notAvailable: t("notAvailable"),
      }}
    />
  );
}
