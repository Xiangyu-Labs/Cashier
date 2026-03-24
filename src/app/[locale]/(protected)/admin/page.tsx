import { getTranslations } from "next-intl/server";
import { AdminHome } from "@/modules/admin/ui";

export default async function AdminPage() {
  const t = await getTranslations("Admin");

  return <AdminHome title={t("homeTitle")} description={t("homeDescription")} />;
}
