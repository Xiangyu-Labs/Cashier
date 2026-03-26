import { getLocale, getTranslations } from "next-intl/server";
import { listAdminUsers } from "@/modules/admin/queries";
import { AdminUsersList } from "@/modules/admin/ui";

interface AdminUsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminUsers");
  const resolvedSearchParams = await searchParams;
  const expandedUserId = getSingleSearchParam(resolvedSearchParams.detail);
  const users = await listAdminUsers();

  return (
    <AdminUsersList
      locale={locale}
      users={users}
      {...(expandedUserId != null ? { expandedUserId } : {})}
      labels={{
        title: t("title"),
        description: t("description"),
        email: t("email"),
        name: t("name"),
        role: t("role"),
        createdAt: t("createdAt"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        userId: t("userId"),
        emailVerified: t("emailVerified"),
        image: t("image"),
        updatedAt: t("updatedAt"),
        deletedAt: t("deletedAt"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        roleUser: t("roleUser"),
        roleSuperAdmin: t("roleSuperAdmin"),
        notAvailable: t("notAvailable"),
        profile: t("profile"),
        timestamps: t("timestamps"),
      }}
    />
  );
}
