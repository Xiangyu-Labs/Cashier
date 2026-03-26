"use client";

import { useMemo } from "react";
import type { AdminEntryDetail } from "@/modules/admin/contracts";

export interface AdminEntryDetailPanelLabels {
  entryBasics: string;
  associations: string;
  amounts: string;
  timing: string;
  entryId: string;
  ledgerId: string;
  userEmail: string;
  categoryId: string;
  categoryName: string;
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  sourceDocumentStatus: string;
  amount: string;
  currency: string;
  itemName: string;
  description: string;
  convertedAmount: string;
  exchangeRate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  notAvailable: string;
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

export function AdminEntryDetailPanel(props: {
  locale: string;
  detail: AdminEntryDetail;
  labels: AdminEntryDetailPanelLabels;
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

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.entryBasics}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={props.labels.entryId} value={props.detail.id} breakAll />
          <Field label={props.labels.ledgerId} value={props.detail.ledgerId} breakAll />
          <Field label={props.labels.itemName} value={props.detail.itemName} />
          <Field label={props.labels.userEmail} value={formatScalar(props.detail.userEmail, props.labels.notAvailable)} breakAll />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.associations}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={props.labels.categoryId} value={formatScalar(props.detail.categoryId, props.labels.notAvailable)} breakAll />
          <Field label={props.labels.categoryName} value={formatScalar(props.detail.categoryName, props.labels.notAvailable)} />
          <Field label={props.labels.sourceDocumentId} value={formatScalar(props.detail.sourceDocumentId, props.labels.notAvailable)} breakAll />
          <Field label={props.labels.sourceDocumentTitle} value={formatScalar(props.detail.sourceDocumentTitle, props.labels.notAvailable)} />
          <Field label={props.labels.sourceDocumentStatus} value={formatScalar(props.detail.sourceDocumentStatus, props.labels.notAvailable)} />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.amounts}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={props.labels.amount} value={props.detail.amount} />
          <Field label={props.labels.currency} value={formatScalar(props.detail.currency, props.labels.notAvailable)} />
          <Field label={props.labels.convertedAmount} value={formatScalar(props.detail.convertedAmount, props.labels.notAvailable)} />
          <Field label={props.labels.exchangeRate} value={formatScalar(props.detail.exchangeRate, props.labels.notAvailable)} />
          <Field label={props.labels.description} value={formatScalar(props.detail.description, props.labels.notAvailable)} preserveWhitespace />
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
    </div>
  );
}
