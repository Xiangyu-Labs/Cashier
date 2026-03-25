import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { requireSuperAdmin } from "@/modules/admin/access";
import { AdminShell, AdminUnauthorizedState } from "@/modules/admin/ui";

export default async function AdminLayout(props: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("Admin");
  const tUnauthorized = await getTranslations("AdminUnauthorized");

  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(`/api/auth/signout?callbackUrl=${encodeURIComponent(`/${locale}/login`)}`);
      return null;
    }

    if (error instanceof ForbiddenError) {
      return (
        <AdminUnauthorizedState
          title={tUnauthorized("title")}
          description={tUnauthorized("description")}
          ctaLabel={tUnauthorized("backHome")}
        />
      );
    }

    throw error;
  }

  return (
    <AdminShell
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      navItems={[
        { href: "/admin", label: t("overview") },
        { href: "/admin/users", label: t("users") },
      ]}
    >
      {props.children}
    </AdminShell>
  );
}
