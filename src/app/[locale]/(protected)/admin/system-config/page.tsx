import { getLocale, getTranslations } from "next-intl/server";
import { listAdminSystemConfig } from "@/modules/admin/queries";
import { AdminSystemConfigList } from "@/modules/admin/ui";

export default async function AdminSystemConfigPage() {
  const locale = await getLocale();
  const t = await getTranslations("AdminSystemConfig");
  const items = await listAdminSystemConfig();

  return (
    <AdminSystemConfigList
      locale={locale}
      items={items}
      labels={{
        title: t("title"),
        description: t("description"),
        readOnlyNotice: t("readOnlyNotice"),
        name: t("name"),
        tier: t("tier"),
        source: t("source"),
        required: t("required"),
        value: t("value"),
        descriptionColumn: t("descriptionColumn"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        tierSystem: t("tierSystem"),
        tierRuntime: t("tierRuntime"),
        sourceEnvironment: t("sourceEnvironment"),
        sourceDefault: t("sourceDefault"),
        sourceMissing: t("sourceMissing"),
        requiredYes: t("requiredYes"),
        requiredNo: t("requiredNo"),
        notSet: t("notSet"),
      }}
    />
  );
}
