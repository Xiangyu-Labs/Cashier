import { getTranslations } from "next-intl/server";
import { getAdminOverviewStats } from "@/modules/admin/queries";
import { AdminHome } from "@/modules/admin/ui";

export default async function AdminPage() {
  const t = await getTranslations("AdminOverview");
  const stats = await getAdminOverviewStats();

  return (
    <AdminHome
      stats={stats}
      labels={{
        title: t("title"),
        description: t("description"),
        totalUsers: t("totalUsers"),
        totalLedgers: t("totalLedgers"),
        totalEntries: t("totalEntries"),
        totalSourceDocuments: t("totalSourceDocuments"),
        totalTasks: t("totalTasks"),
        totalCategories: t("totalCategories"),
        totalServiceCredentials: t("totalServiceCredentials"),
        totalAccounts: t("totalAccounts"),
        totalCurrencyRates: t("totalCurrencyRates"),
        totalOTPTokens: t("totalOTPTokens"),
      }}
    />
  );
}
