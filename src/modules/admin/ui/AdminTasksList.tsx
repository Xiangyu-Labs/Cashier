"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type {
  AdminTaskDetail,
  AdminTaskListItem,
  AdminTaskRange,
  AdminTaskStatus,
} from "@/modules/admin/contracts";
import { AdminTaskDetailPanel } from "./AdminTaskDetailPanel";
import { AdminTaskStatusBadge } from "./AdminTaskStatusBadge";

export interface AdminTaskFiltersState {
  status?: AdminTaskStatus;
  type?: string;
  range: AdminTaskRange;
  limit?: string;
}

export interface AdminTasksListLabels {
  title: string;
  description: string;
  createdAt: string;
  status: string;
  type: string;
  task: string;
  scope: string;
  entity: string;
  details: string;
  hideDetails: string;
  taskId: string;
  scopeId: string;
  entityType: string;
  entityId: string;
  startedAt: string;
  completedAt: string;
  duration: string;
  durationHoursUnit: string;
  durationMinutesUnit: string;
  durationSecondsUnit: string;
  progress: string;
  error: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
  statusPending: string;
  statusRunning: string;
  statusCompleted: string;
  statusFailed: string;
  statusCancelled: string;
  input?: string;
  deduplicationKey?: string;
  updatedAt?: string;
  deletedAt?: string;
  tokenUsage?: string;
  taskBasics?: string;
  scopeAndEntity?: string;
  timing?: string;
  execution?: string;
  rawData?: string;
  showRawData?: string;
  hideRawData?: string;
  scopeUserEmail?: string;
  notAvailable?: string;
}

function toStatusLabel(status: AdminTaskStatus, labels: AdminTasksListLabels): string {
  switch (status) {
    case "pending":
      return labels.statusPending;
    case "running":
      return labels.statusRunning;
    case "completed":
      return labels.statusCompleted;
    case "failed":
      return labels.statusFailed;
    case "cancelled":
      return labels.statusCancelled;
    default:
      return status;
  }
}

function formatEntity(item: AdminTaskListItem): string {
  if (item.entityType != null && item.entityId != null) {
    return `${item.entityType}:${item.entityId}`;
  }

  if (item.entityId != null) {
    return item.entityId;
  }

  if (item.entityType != null) {
    return item.entityType;
  }

  return "—";
}

function buildNextPageHref(filters: AdminTaskFiltersState, nextCursor: string): string {
  const params = new URLSearchParams();

  if (filters.status != null) {
    params.set("status", filters.status);
  }

  if (filters.type != null && filters.type !== "") {
    params.set("type", filters.type);
  }

  if (filters.range !== "all") {
    params.set("range", filters.range);
  }

  if (filters.limit != null && filters.limit !== "") {
    params.set("limit", filters.limit);
  }

  params.set("cursor", nextCursor);
  return `/admin/tasks?${params.toString()}`;
}

function buildTaskDetailHref(
  filters: AdminTaskFiltersState,
  taskId: string | null,
  currentCursor?: string | null
): string {
  const params = new URLSearchParams();

  if (filters.status != null) {
    params.set("status", filters.status);
  }

  if (filters.type != null && filters.type !== "") {
    params.set("type", filters.type);
  }

  if (filters.range !== "all") {
    params.set("range", filters.range);
  }

  if (filters.limit != null && filters.limit !== "") {
    params.set("limit", filters.limit);
  }

  if (currentCursor != null && currentCursor !== "") {
    params.set("cursor", currentCursor);
  }

  if (taskId != null) {
    params.set("detail", taskId);
  }

  const query = params.toString();
  return query === "" ? "/admin/tasks" : `/admin/tasks?${query}`;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

export function AdminTasksList(props: {
  locale: string;
  items: AdminTaskListItem[];
  hasAnyTasks: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedTaskId?: string | null;
  expandedTaskDetail?: AdminTaskDetail | null;
  filters: AdminTaskFiltersState;
  labels: AdminTasksListLabels;
}) {
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    [props.locale]
  );

  if (props.items.length === 0) {
    const title = props.hasAnyTasks ? props.labels.filteredEmptyTitle : props.labels.emptyTitle;
    const description = props.hasAnyTasks
      ? props.labels.filteredEmptyDescription
      : props.labels.emptyDescription;

    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.status}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.type}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.task}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.scope}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.entity}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const statusLabel = toStatusLabel(item.status, props.labels);
              const detail =
                props.expandedTaskId === item.id && props.expandedTaskDetail != null
                  ? props.expandedTaskDetail
                  : null;
              const isExpanded = detail != null;

              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <AdminTaskStatusBadge status={item.status} label={statusLabel} />
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{item.type}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      <div className="space-y-1">
                        <p className="font-medium text-text">{item.title}</p>
                        {item.status === "failed" && item.error != null && item.error !== "" ? (
                          <p className="max-w-md truncate text-xs text-danger">{item.error}</p>
                        ) : null}
                        <Link
                          href={buildTaskDetailHref(
                            props.filters,
                            isExpanded ? null : item.id,
                            props.currentCursor
                          )}
                          prefetch={false}
                          scroll={false}
                          className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                        >
                          {isExpanded ? props.labels.hideDetails : props.labels.details}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{item.scopeUserEmail ?? item.scopeId ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-text">{formatEntity(item)}</td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={6} className="border-t border-border bg-surface2 px-6 py-4">
                        <AdminTaskDetailPanel
                          locale={props.locale}
                          detail={detail}
                          labels={{
                            taskBasics: props.labels.taskBasics ?? "Task basics",
                            scopeAndEntity: props.labels.scopeAndEntity ?? "Scope and entity",
                            timing: props.labels.timing ?? "Timing",
                            execution: props.labels.execution ?? "Execution",
                            rawData: props.labels.rawData ?? "Raw data",
                            showRawData: props.labels.showRawData ?? "Show raw data",
                            hideRawData: props.labels.hideRawData ?? "Hide raw data",
                            taskId: props.labels.taskId,
                            status: props.labels.status,
                            type: props.labels.type,
                            task: props.labels.task,
                            scopeId: props.labels.scopeId,
                            entityType: props.labels.entityType,
                            entityId: props.labels.entityId,
                            deduplicationKey: props.labels.deduplicationKey ?? "Deduplication Key",
                            scopeUserEmail: props.labels.scopeUserEmail ?? "Scope User Email",
                            createdAt: props.labels.createdAt,
                            updatedAt: props.labels.updatedAt ?? "Updated At",
                            startedAt: props.labels.startedAt,
                            completedAt: props.labels.completedAt,
                            deletedAt: props.labels.deletedAt ?? "Deleted At",
                            duration: props.labels.duration,
                            progress: props.labels.progress,
                            error: props.labels.error,
                            input: props.labels.input ?? "Input",
                            tokenUsage: props.labels.tokenUsage ?? "Token Usage",
                            notAvailable: props.labels.notAvailable ?? "—",
                            durationHoursUnit: props.labels.durationHoursUnit,
                            durationMinutesUnit: props.labels.durationMinutesUnit,
                            durationSecondsUnit: props.labels.durationSecondsUnit,
                            statusPending: props.labels.statusPending,
                            statusRunning: props.labels.statusRunning,
                            statusCompleted: props.labels.statusCompleted,
                            statusFailed: props.labels.statusFailed,
                            statusCancelled: props.labels.statusCancelled,
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {props.nextCursor != null ? (
        <div className="border-t border-border px-6 py-4">
          <Link
            href={buildNextPageHref(props.filters, props.nextCursor)}
            className="inline-flex text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {props.labels.nextPage}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
