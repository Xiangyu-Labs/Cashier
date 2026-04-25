import type { AdminOverviewStats } from "@/modules/admin/contracts";
import { AdminOverviewStatCard } from "./AdminOverviewStatCard";

export interface AdminHomeLabels {
  title: string;
  description: string;
  totalUsers: string;
  totalLedgers: string;
  totalEntries: string;
  totalSourceDocuments: string;
  totalTasks: string;
  totalCategories: string;
  totalServiceCredentials: string;
  totalAccounts: string;
  totalCurrencyRates: string;
  totalOTPTokens: string;
}

export function AdminHome(props: {
  stats: AdminOverviewStats;
  labels: AdminHomeLabels;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-xl font-semibold text-text">{props.labels.title}</h2>
          <p className="text-sm leading-6 text-muted">{props.labels.description}</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <AdminOverviewStatCard
          href="/admin/users"
          label={props.labels.totalUsers}
          value={props.stats.totalUsers}
        />
        <AdminOverviewStatCard
          href="/admin/ledgers"
          label={props.labels.totalLedgers}
          value={props.stats.totalLedgers}
        />
        <AdminOverviewStatCard
          href="/admin/entries"
          label={props.labels.totalEntries}
          value={props.stats.totalEntries}
        />
        <AdminOverviewStatCard
          href="/admin/source-documents"
          label={props.labels.totalSourceDocuments}
          value={props.stats.totalSourceDocuments}
        />
        <AdminOverviewStatCard
          href="/admin/tasks"
          label={props.labels.totalTasks}
          value={props.stats.totalTasks}
        />
        <AdminOverviewStatCard
          href="/admin/categories"
          label={props.labels.totalCategories}
          value={props.stats.totalCategories}
        />
        <AdminOverviewStatCard
          href="/admin/service-credentials"
          label={props.labels.totalServiceCredentials}
          value={props.stats.totalServiceCredentials}
        />
        <AdminOverviewStatCard
          href="/admin/accounts"
          label={props.labels.totalAccounts}
          value={props.stats.totalAccounts}
        />
        <AdminOverviewStatCard
          href="/admin/currency-rates"
          label={props.labels.totalCurrencyRates}
          value={props.stats.totalCurrencyRates}
        />
        <AdminOverviewStatCard
          href="/admin/otp-tokens"
          label={props.labels.totalOTPTokens}
          value={props.stats.totalOTPTokens}
        />
      </div>
    </div>
  );
}
