"use client";

import { Fragment, useMemo, useState } from "react";
import { Link } from "@/i18n/routing";
import type { AdminTaskRange, AdminTaskStatus, AdminTaskListItem } from "@/modules/admin/contracts";
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

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

function formatDuration(
  startedAt: Date | null,
  completedAt: Date | null,
  labels: Pick<AdminTasksListLabels, "durationHoursUnit" | "durationMinutesUnit" | "durationSecondsUnit">
): string {
  if (startedAt == null || completedAt == null) {
    return "—";
  }

  const milliseconds = completedAt.getTime() - startedAt.getTime();
  if (milliseconds < 0) {
    return "—";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}${labels.durationHoursUnit} ${minutes}${labels.durationMinutesUnit} ${seconds}${labels.durationSecondsUnit}`;
  }

  return `${minutes}${labels.durationMinutesUnit} ${seconds}${labels.durationSecondsUnit}`;
}

export function AdminTasksList(props: {
  locale: string;
  items: AdminTaskListItem[];
  hasAnyTasks: boolean;
  nextCursor: string | null;
  filters: AdminTaskFiltersState;
  labels: AdminTasksListLabels;
}) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

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
              const isExpanded = expandedTaskId === item.id;

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
                        <button
                          type="button"
                          className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                          onClick={() => setExpandedTaskId((prev) => (prev === item.id ? null : item.id))}
                        >
                          {isExpanded ? props.labels.hideDetails : props.labels.details}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{item.scopeUserEmail ?? item.scopeId ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-text">{formatEntity(item)}</td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={6} className="border-t border-border bg-surface2 px-6 py-4">
                        <dl className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <dt className="text-xs text-muted">{props.labels.taskId}</dt>
                            <dd className="break-all text-sm text-text">{item.id}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.progress}</dt>
                            <dd className="text-sm text-text">{item.progress ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.scopeId}</dt>
                            <dd className="break-all text-sm text-text">{item.scopeId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.entityType}</dt>
                            <dd className="text-sm text-text">{item.entityType ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.entityId}</dt>
                            <dd className="break-all text-sm text-text">{item.entityId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.createdAt}</dt>
                            <dd className="text-sm text-text">{formatOptionalDate(item.createdAt, dateFormatter)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.startedAt}</dt>
                            <dd className="text-sm text-text">
                              {formatOptionalDate(item.startedAt, dateFormatter)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.completedAt}</dt>
                            <dd className="text-sm text-text">
                              {formatOptionalDate(item.completedAt, dateFormatter)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.duration}</dt>
                            <dd className="text-sm text-text">
                              {formatDuration(item.startedAt, item.completedAt, props.labels)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{props.labels.error}</dt>
                            <dd className="whitespace-pre-wrap break-words text-sm text-text">
                              {item.error ?? "—"}
                            </dd>
                          </div>
                        </dl>
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
