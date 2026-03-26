"use client";

import { useMemo, useState } from "react";
import type { AdminSourceDocumentDetail } from "@/modules/admin/contracts";
import { AdminTaskJsonBlock } from "./AdminTaskJsonBlock";

export interface AdminSourceDocumentDetailPanelLabels {
  documentBasics: string;
  ledgerAndResults: string;
  content: string;
  timing: string;
  rawData: string;
  showRawData: string;
  hideRawData: string;
  sourceDocumentId: string;
  ledgerId: string;
  userEmail: string;
  title: string;
  text: string;
  status: string;
  type: string;
  entryDate: string;
  entryCount: string;
  anomalyReason: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  metadata: string;
  imageUrls: string;
  notAvailable: string;
  statusQueued: string;
  statusProcessing: string;
  statusCompleted: string;
  statusAnomaly: string;
  statusFailed: string;
  statusDeleted: string;
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

function toStatusLabel(
  status: AdminSourceDocumentDetail["status"],
  labels: AdminSourceDocumentDetailPanelLabels
): string {
  switch (status) {
    case "queued":
      return labels.statusQueued;
    case "processing":
      return labels.statusProcessing;
    case "completed":
      return labels.statusCompleted;
    case "anomaly":
      return labels.statusAnomaly;
    case "failed":
      return labels.statusFailed;
    case "deleted":
      return labels.statusDeleted;
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

export function AdminSourceDocumentDetailPanel(props: {
  locale: string;
  detail: AdminSourceDocumentDetail;
  labels: AdminSourceDocumentDetailPanelLabels;
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

  const statusLabel = toStatusLabel(props.detail.status, props.labels);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.documentBasics}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={props.labels.sourceDocumentId} value={props.detail.id} breakAll />
          <Field label={props.labels.status} value={statusLabel} />
          <Field label={props.labels.type} value={props.detail.type} />
          <Field label={props.labels.title} value={formatScalar(props.detail.title, props.labels.notAvailable)} />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.ledgerAndResults}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={props.labels.ledgerId} value={props.detail.ledgerId} breakAll />
          <Field label={props.labels.userEmail} value={formatScalar(props.detail.userEmail, props.labels.notAvailable)} breakAll />
          <Field label={props.labels.entryDate} value={formatScalar(props.detail.entryDate, props.labels.notAvailable)} />
          <Field label={props.labels.entryCount} value={String(props.detail.entryCount)} />
          <Field label={props.labels.anomalyReason} value={formatScalar(props.detail.anomalyReason, props.labels.notAvailable)} preserveWhitespace />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.content}</h3>
        <dl className="mt-3 grid gap-3">
          <Field label={props.labels.text} value={formatScalar(props.detail.text, props.labels.notAvailable)} preserveWhitespace />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.timing}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={props.labels.createdAt} value={formatDate(props.detail.createdAt, dateFormatter, props.labels.notAvailable)} />
          <Field label={props.labels.updatedAt} value={formatDate(props.detail.updatedAt, dateFormatter, props.labels.notAvailable)} />
          <Field label={props.labels.deletedAt} value={formatDate(props.detail.deletedAt, dateFormatter, props.labels.notAvailable)} />
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
              label={props.labels.metadata}
              value={props.detail.metadata}
              notAvailableLabel={props.labels.notAvailable}
            />
            <AdminTaskJsonBlock
              label={props.labels.imageUrls}
              value={props.detail.imageUrls}
              notAvailableLabel={props.labels.notAvailable}
            />
          </dl>
        ) : null}
      </section>
    </div>
  );
}
