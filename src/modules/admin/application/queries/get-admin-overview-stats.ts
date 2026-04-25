import { isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import type { AdminOverviewStats } from "@/modules/admin/contracts";
import {
  accounts,
  currencyRates,
  entryCategories,
  ledgerEntries,
  ledgers,
  otpTokens,
  serviceCredentials,
  sourceDocuments,
  taskRuns,
  users,
} from "@/persistence";

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  await requireSuperAdmin();

  const [
    totalUsers,
    totalLedgers,
    totalEntries,
    totalSourceDocuments,
    totalTasks,
    totalCategories,
    totalServiceCredentials,
    totalAccounts,
    totalCurrencyRates,
    totalOTPTokens,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users).where(isNull(users.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(ledgers).where(isNull(ledgers.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(ledgerEntries).where(isNull(ledgerEntries.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(sourceDocuments).where(isNull(sourceDocuments.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(taskRuns).where(isNull(taskRuns.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(entryCategories).where(isNull(entryCategories.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(serviceCredentials).where(isNull(serviceCredentials.deletedAt)),
    db.select({ count: sql<number>`count(*)` }).from(accounts),
    db.select({ count: sql<number>`count(*)` }).from(currencyRates),
    db.select({ count: sql<number>`count(*)` }).from(otpTokens),
  ]);

  return {
    totalUsers: totalUsers[0]?.count ?? 0,
    totalLedgers: totalLedgers[0]?.count ?? 0,
    totalEntries: totalEntries[0]?.count ?? 0,
    totalSourceDocuments: totalSourceDocuments[0]?.count ?? 0,
    totalTasks: totalTasks[0]?.count ?? 0,
    totalCategories: totalCategories[0]?.count ?? 0,
    totalServiceCredentials: totalServiceCredentials[0]?.count ?? 0,
    totalAccounts: totalAccounts[0]?.count ?? 0,
    totalCurrencyRates: totalCurrencyRates[0]?.count ?? 0,
    totalOTPTokens: totalOTPTokens[0]?.count ?? 0,
  };
}
