import { getLocale, getTranslations } from "next-intl/server";
import { listAdminUsers } from "@/modules/admin/queries";
import { AdminUsersList } from "@/modules/admin/ui";

export default async function AdminUsersPage() {
  const locale = await getLocale();
  const t = await getTranslations("AdminUsers");
  const users = await listAdminUsers();

  return (
    <AdminUsersList
      locale={locale}
      users={users}
      labels={{
        title: t("title"),
        description: t("description"),
        email: t("email"),
        name: t("name"),
        role: t("role"),
        createdAt: t("createdAt"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        roleUser: t("roleUser"),
        roleSuperAdmin: t("roleSuperAdmin"),
      }}
    />
  );
}
