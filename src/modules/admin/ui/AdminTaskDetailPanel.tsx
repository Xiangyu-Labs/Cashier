"use client";

import { useMemo, useState } from "react";
import type { AdminTaskDetail } from "@/modules/admin/contracts";
import { AdminTaskJsonBlock } from "./AdminTaskJsonBlock";

export interface AdminTaskDetailPanelLabels {
  taskBasics: string;
  scopeAndEntity: string;
  timing: string;
  execution: string;
  rawData: string;
  showRawData: string;
  hideRawData: string;
  taskId: string;
  status: string;
  type: string;
  task: string;
  scopeId: string;
  entityType: string;
  entityId: string;
  deduplicationKey: string;
  scopeUserEmail: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt: string;
  deletedAt: string;
  duration: string;
  progress: string;
  error: string;
  input: string;
  tokenUsage: string;
  notAvailable: string;
  durationHoursUnit: string;
  durationMinutesUnit: string;
  durationSecondsUnit: string;
  statusPending: string;
  statusRunning: string;
  statusCompleted: string;
  statusFailed: string;
  statusCancelled: string;
}

function formatDate(value: Date | null, formatter: Intl.DateTimeFormat, notAvailableLabel: string): string {
  if (value == null) {
    return notAvailableLabel;
  }

  return formatter.format(value);
}

function formatScalar(value: string | null | undefined, notAvailableLabel: string): string {
  if (value == null || value === "") {
    return notAvailableLabel;
  }

  return value;
}

function formatDuration(
  startedAt: Date | null,
  completedAt: Date | null,
  labels: Pick<
    AdminTaskDetailPanelLabels,
    "durationHoursUnit" | "durationMinutesUnit" | "durationSecondsUnit" | "notAvailable"
  >
): string {
  if (startedAt == null || completedAt == null) {
    return labels.notAvailable;
  }

  const milliseconds = completedAt.getTime() - startedAt.getTime();
  if (milliseconds < 0) {
    return labels.notAvailable;
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

function toStatusLabel(status: AdminTaskDetail["status"], labels: AdminTaskDetailPanelLabels): string {
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

function Field(props: { label: string; value: string; breakAll?: boolean; preserveWhitespace?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{props.label}</dt>
      <dd
        className={`${props.preserveWhitespace ? "whitespace-pre-wrap break-words" : ""} mt-1 text-sm text-text ${props.breakAll ? "break-all" : ""}`.trim()}
      >
        {props.value}
      </dd>
    </div>
  );
}

export function AdminTaskDetailPanel(props: {
  locale: string;
  detail: AdminTaskDetail;
  labels: AdminTaskDetailPanelLabels;
}) {
  const [isRawDataOpen, setIsRawDataOpen] = useState(false);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    [props.locale]
  );

  const duration = formatDuration(props.detail.startedAt, props.detail.completedAt, props.labels);
  const statusLabel = toStatusLabel(props.detail.status, props.labels);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.taskBasics}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={props.labels.taskId} value={props.detail.id} breakAll />
          <Field label={props.labels.status} value={statusLabel} />
          <Field label={props.labels.type} value={props.detail.type} />
          <Field label={props.labels.task} value={formatScalar(props.detail.title, props.labels.notAvailable)} />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.scopeAndEntity}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={props.labels.scopeId} value={formatScalar(props.detail.scopeId, props.labels.notAvailable)} breakAll />
          <Field label={props.labels.entityType} value={formatScalar(props.detail.entityType, props.labels.notAvailable)} />
          <Field label={props.labels.entityId} value={formatScalar(props.detail.entityId, props.labels.notAvailable)} breakAll />
          <Field label={props.labels.deduplicationKey} value={formatScalar(props.detail.deduplicationKey, props.labels.notAvailable)} breakAll />
          <Field label={props.labels.scopeUserEmail} value={formatScalar(props.detail.scopeUserEmail, props.labels.notAvailable)} breakAll />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.timing}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={props.labels.createdAt} value={formatDate(props.detail.createdAt, dateFormatter, props.labels.notAvailable)} />
          <Field label={props.labels.updatedAt} value={formatDate(props.detail.updatedAt, dateFormatter, props.labels.notAvailable)} />
          <Field label={props.labels.startedAt} value={formatDate(props.detail.startedAt, dateFormatter, props.labels.notAvailable)} />
          <Field label={props.labels.completedAt} value={formatDate(props.detail.completedAt, dateFormatter, props.labels.notAvailable)} />
          <Field label={props.labels.deletedAt} value={formatDate(props.detail.deletedAt, dateFormatter, props.labels.notAvailable)} />
          <Field label={props.labels.duration} value={duration} />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.execution}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={props.labels.progress} value={formatScalar(props.detail.progress, props.labels.notAvailable)} />
          <Field
            label={props.labels.error}
            value={formatScalar(props.detail.error, props.labels.notAvailable)}
            preserveWhitespace
          />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-text">{props.labels.rawData}</h3>
          <button
            type="button"
            className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
            onClick={() => setIsRawDataOpen((current) => !current)}
          >
            {isRawDataOpen ? props.labels.hideRawData : props.labels.showRawData}
          </button>
        </div>
        {isRawDataOpen ? (
          <dl className="mt-3 space-y-3">
            <AdminTaskJsonBlock
              label={props.labels.input}
              value={props.detail.input}
              notAvailableLabel={props.labels.notAvailable}
            />
            <AdminTaskJsonBlock
              label={props.labels.tokenUsage}
              value={props.detail.tokenUsage}
              notAvailableLabel={props.labels.notAvailable}
            />
          </dl>
        ) : null}
      </section>
    </div>
  );
}
