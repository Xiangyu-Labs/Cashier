"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type {
  AdminSourceDocumentDetail,
  AdminSourceDocumentListItem,
  AdminSourceDocumentStatus,
} from "@/modules/admin/contracts";
import type { AdminSourceDocumentFiltersState } from "./AdminSourceDocumentFilters";
import { AdminSourceDocumentDetailPanel } from "./AdminSourceDocumentDetailPanel";
import { AdminSourceDocumentStatusBadge } from "./AdminSourceDocumentStatusBadge";

export interface AdminSourceDocumentsListLabels {
  title: string;
  description: string;
  createdAt: string;
  status: string;
  type: string;
  user: string;
  sourceDocument: string;
  results: string;
  entryCount: string;
  entryDate: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
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
  titleLabel: string;
  text: string;
  anomalyReason: string;
  metadata: string;
  imageUrls: string;
  updatedAt: string;
  deletedAt: string;
  notAvailable: string;
  statusQueued: string;
  statusProcessing: string;
  statusCompleted: string;
  statusAnomaly: string;
  statusFailed: string;
  statusDeleted: string;
}

function toStatusLabel(status: AdminSourceDocumentStatus, labels: AdminSourceDocumentsListLabels): string {
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

function buildNextPageHref(filters: AdminSourceDocumentFiltersState, nextCursor: string): string {
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

  if (filters.result !== "all") {
    params.set("result", filters.result);
  }

  if (filters.limit != null && filters.limit !== "") {
    params.set("limit", filters.limit);
  }

  params.set("cursor", nextCursor);
  return `/admin/source-documents?${params.toString()}`;
}

function buildSourceDocumentDetailHref(
  filters: AdminSourceDocumentFiltersState,
  sourceDocumentId: string | null,
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

  if (filters.result !== "all") {
    params.set("result", filters.result);
  }

  if (filters.limit != null && filters.limit !== "") {
    params.set("limit", filters.limit);
  }

  if (currentCursor != null && currentCursor !== "") {
    params.set("cursor", currentCursor);
  }

  if (sourceDocumentId != null) {
    params.set("detail", sourceDocumentId);
  }

  const query = params.toString();
  return query === "" ? "/admin/source-documents" : `/admin/source-documents?${query}`;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

export function AdminSourceDocumentsList(props: {
  locale: string;
  items: AdminSourceDocumentListItem[];
  hasAnySourceDocuments: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedSourceDocumentId?: string | null;
  expandedSourceDocumentDetail?: AdminSourceDocumentDetail | null;
  filters: AdminSourceDocumentFiltersState;
  labels: AdminSourceDocumentsListLabels;
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
    const title = props.hasAnySourceDocuments
      ? props.labels.filteredEmptyTitle
      : props.labels.emptyTitle;
    const description = props.hasAnySourceDocuments
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
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[18%]" />
            <col className="w-[24%]" />
            <col className="w-[14%]" />
            <col className="w-[8%]" />
          </colgroup>
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
                {props.labels.user}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.sourceDocument}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.results}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const statusLabel = toStatusLabel(item.status, props.labels);
              const detail =
                props.expandedSourceDocumentId === item.id && props.expandedSourceDocumentDetail != null
                  ? props.expandedSourceDocumentDetail
                  : null;
              const isExpanded = detail != null;

              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <AdminSourceDocumentStatusBadge status={item.status} label={statusLabel} />
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.type}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.userEmail ?? item.ledgerId}
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.title ?? item.id}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      <div>{`${props.labels.entryCount}: ${item.entryCount}`}</div>
                      <div className="mt-1 text-muted">
                        {`${props.labels.entryDate}: ${item.entryDate ?? props.labels.notAvailable}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={buildSourceDocumentDetailHref(
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
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={7} className="border-t border-border bg-surface2 px-6 py-4">
                        <AdminSourceDocumentDetailPanel
                          locale={props.locale}
                          detail={detail}
                          labels={{
                            documentBasics: props.labels.documentBasics,
                            ledgerAndResults: props.labels.ledgerAndResults,
                            content: props.labels.content,
                            timing: props.labels.timing,
                            rawData: props.labels.rawData,
                            showRawData: props.labels.showRawData,
                            hideRawData: props.labels.hideRawData,
                            sourceDocumentId: props.labels.sourceDocumentId,
                            ledgerId: props.labels.ledgerId,
                            userEmail: props.labels.userEmail,
                            title: props.labels.titleLabel,
                            text: props.labels.text,
                            status: props.labels.status,
                            type: props.labels.type,
                            entryDate: props.labels.entryDate,
                            entryCount: props.labels.entryCount,
                            anomalyReason: props.labels.anomalyReason,
                            createdAt: props.labels.createdAt,
                            updatedAt: props.labels.updatedAt,
                            deletedAt: props.labels.deletedAt,
                            metadata: props.labels.metadata,
                            imageUrls: props.labels.imageUrls,
                            notAvailable: props.labels.notAvailable,
                            statusQueued: props.labels.statusQueued,
                            statusProcessing: props.labels.statusProcessing,
                            statusCompleted: props.labels.statusCompleted,
                            statusAnomaly: props.labels.statusAnomaly,
                            statusFailed: props.labels.statusFailed,
                            statusDeleted: props.labels.statusDeleted,
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
            prefetch={false}
            scroll={false}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
          >
            {props.labels.nextPage}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
