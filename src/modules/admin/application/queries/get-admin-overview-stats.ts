import type { AdminOverviewStats } from "@/modules/admin/contracts";

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  return {
    totalUsers: 0,
    totalLedgers: 0,
    totalEntries: 0,
    totalSourceDocuments: 0,
    totalTasks: 0,
    totalCategories: 0,
    totalServiceCredentials: 0,
    totalAccounts: 0,
    totalCurrencyRates: 0,
    totalOTPTokens: 0,
  };
}
