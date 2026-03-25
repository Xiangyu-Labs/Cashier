import { getLocale, getTranslations } from "next-intl/server";
import { listAdminTasks } from "@/modules/admin/queries";
import { AdminTaskFilters, AdminTasksList, type AdminTaskFiltersState } from "@/modules/admin/ui";

interface AdminTasksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function AdminTasksPage({ searchParams }: AdminTasksPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminTasks");
  const resolvedSearchParams = await searchParams;

  const normalizedSearchParams = {
    status: getSingleSearchParam(resolvedSearchParams.status),
    type: getSingleSearchParam(resolvedSearchParams.type),
    range: getSingleSearchParam(resolvedSearchParams.range),
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const tasks = await listAdminTasks(normalizedSearchParams);

  const filters: AdminTaskFiltersState = {
    ...(normalizedSearchParams.status != null
      ? { status: normalizedSearchParams.status as NonNullable<AdminTaskFiltersState["status"]> }
      : {}),
    ...(normalizedSearchParams.type != null ? { type: normalizedSearchParams.type } : {}),
    range: (normalizedSearchParams.range as AdminTaskFiltersState["range"] | undefined) ?? "all",
    ...(normalizedSearchParams.limit != null ? { limit: normalizedSearchParams.limit } : {}),
  };

  return (
    <div className="space-y-4">
      <AdminTaskFilters
        availableTypes={tasks.availableTypes}
        filters={filters}
        labels={{
          status: t("status"),
          type: t("type"),
          range: t("range"),
          allStatuses: t("allStatuses"),
          allTypes: t("allTypes"),
          statusPending: t("statusPending"),
          statusRunning: t("statusRunning"),
          statusCompleted: t("statusCompleted"),
          statusFailed: t("statusFailed"),
          statusCancelled: t("statusCancelled"),
          range24h: t("range24h"),
          range7d: t("range7d"),
          range30d: t("range30d"),
          rangeAll: t("rangeAll"),
          resetFilters: t("resetFilters"),
        }}
      />

      <AdminTasksList
        locale={locale}
        items={tasks.items}
        hasAnyTasks={tasks.hasAnyTasks}
        nextCursor={tasks.nextCursor}
        filters={filters}
        labels={{
          title: t("title"),
          description: t("description"),
          createdAt: t("createdAt"),
          status: t("status"),
          type: t("type"),
          task: t("task"),
          scope: t("scope"),
          entity: t("entity"),
          details: t("details"),
          hideDetails: t("hideDetails"),
          taskId: t("taskId"),
          scopeId: t("scopeId"),
          entityType: t("entityType"),
          entityId: t("entityId"),
          startedAt: t("startedAt"),
          completedAt: t("completedAt"),
          duration: t("duration"),
          durationHoursUnit: t("durationHoursUnit"),
          durationMinutesUnit: t("durationMinutesUnit"),
          durationSecondsUnit: t("durationSecondsUnit"),
          progress: t("progress"),
          error: t("error"),
          emptyTitle: t("emptyTitle"),
          emptyDescription: t("emptyDescription"),
          filteredEmptyTitle: t("filteredEmptyTitle"),
          filteredEmptyDescription: t("filteredEmptyDescription"),
          nextPage: t("nextPage"),
          statusPending: t("statusPending"),
          statusRunning: t("statusRunning"),
          statusCompleted: t("statusCompleted"),
          statusFailed: t("statusFailed"),
          statusCancelled: t("statusCancelled"),
        }}
      />
    </div>
  );
}
