"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminEntryDetail, AdminEntryListItem } from "@/modules/admin/contracts";
import type { AdminEntryFiltersState } from "./AdminEntryFilters";
import { AdminEntryDetailPanel } from "./AdminEntryDetailPanel";

export interface AdminEntriesListLabels {
  title: string;
  description: string;
  createdAt: string;
  user: string;
  itemName: string;
  amount: string;
  currency: string;
  category: string;
  sourceDocument: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
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
  descriptionLabel: string;
  convertedAmount: string;
  exchangeRate: string;
  updatedAt: string;
  deletedAt: string;
  notAvailable: string;
}

function buildNextPageHref(filters: AdminEntryFiltersState, nextCursor: string): string {
  const params = new URLSearchParams();

  if (filters.range !== "all") {
    params.set("range", filters.range);
  }

  if (filters.currency != null && filters.currency !== "") {
    params.set("currency", filters.currency);
  }

  if (filters.categoryId != null && filters.categoryId !== "") {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.sourceLink !== "all") {
    params.set("sourceLink", filters.sourceLink);
  }

  if (filters.limit != null && filters.limit !== "") {
    params.set("limit", filters.limit);
  }

  params.set("cursor", nextCursor);
  return `/admin/entries?${params.toString()}`;
}

function buildEntryDetailHref(
  filters: AdminEntryFiltersState,
  entryId: string | null,
  currentCursor?: string | null
): string {
  const params = new URLSearchParams();

  if (filters.range !== "all") {
    params.set("range", filters.range);
  }

  if (filters.currency != null && filters.currency !== "") {
    params.set("currency", filters.currency);
  }

  if (filters.categoryId != null && filters.categoryId !== "") {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.sourceLink !== "all") {
    params.set("sourceLink", filters.sourceLink);
  }

  if (filters.limit != null && filters.limit !== "") {
    params.set("limit", filters.limit);
  }

  if (currentCursor != null && currentCursor !== "") {
    params.set("cursor", currentCursor);
  }

  if (entryId != null) {
    params.set("detail", entryId);
  }

  const query = params.toString();
  return query === "" ? "/admin/entries" : `/admin/entries?${query}`;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

export function AdminEntriesList(props: {
  locale: string;
  items: AdminEntryListItem[];
  hasAnyEntries: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedEntryId?: string | null;
  expandedEntryDetail?: AdminEntryDetail | null;
  filters: AdminEntryFiltersState;
  labels: AdminEntriesListLabels;
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
    const title = props.hasAnyEntries ? props.labels.filteredEmptyTitle : props.labels.emptyTitle;
    const description = props.hasAnyEntries
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
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.user}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.itemName}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.amount}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.currency}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.category}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.sourceDocument}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const detail =
                props.expandedEntryId === item.id && props.expandedEntryDetail != null
                  ? props.expandedEntryDetail
                  : null;
              const isExpanded = detail != null;

              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.userEmail ?? item.ledgerId}
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.itemName}</td>
                    <td className="px-6 py-4 text-sm text-text">{item.amount}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      {item.currency ?? props.labels.notAvailable}
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.categoryName ?? item.categoryId ?? props.labels.notAvailable}
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.sourceDocumentId ?? props.labels.notAvailable}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={buildEntryDetailHref(props.filters, isExpanded ? null : item.id, props.currentCursor)}
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
                      <td colSpan={8} className="border-t border-border bg-surface2 px-6 py-4">
                        <AdminEntryDetailPanel
                          locale={props.locale}
                          detail={detail}
                          labels={{
                            entryBasics: props.labels.entryBasics,
                            associations: props.labels.associations,
                            amounts: props.labels.amounts,
                            timing: props.labels.timing,
                            entryId: props.labels.entryId,
                            ledgerId: props.labels.ledgerId,
                            userEmail: props.labels.userEmail,
                            categoryId: props.labels.categoryId,
                            categoryName: props.labels.categoryName,
                            sourceDocumentId: props.labels.sourceDocumentId,
                            sourceDocumentTitle: props.labels.sourceDocumentTitle,
                            sourceDocumentStatus: props.labels.sourceDocumentStatus,
                            amount: props.labels.amount,
                            currency: props.labels.currency,
                            itemName: props.labels.itemName,
                            description: props.labels.descriptionLabel,
                            convertedAmount: props.labels.convertedAmount,
                            exchangeRate: props.labels.exchangeRate,
                            createdAt: props.labels.createdAt,
                            updatedAt: props.labels.updatedAt,
                            deletedAt: props.labels.deletedAt,
                            notAvailable: props.labels.notAvailable,
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
