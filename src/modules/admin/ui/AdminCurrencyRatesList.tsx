"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminCurrencyRateListItem } from "@/modules/admin/contracts";

export interface AdminCurrencyRatesListLabels {
  title: string;
  description: string;
  date: string;
  base: string;
  rateCount: string;
  updatedAt: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
  rates: string;
  showRawData: string;
  hideRawData: string;
  notAvailable: string;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

function buildNextPageHref(nextCursor: string): string {
  return `/admin/currency-rates?cursor=${encodeURIComponent(nextCursor)}`;
}

export function AdminCurrencyRatesList(props: {
  locale: string;
  items: AdminCurrencyRateListItem[];
  hasAnyCurrencyRates: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedDate?: string | null;
  expandedRates?: Record<string, number> | null;
  labels: AdminCurrencyRatesListLabels;
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
    const title = props.hasAnyCurrencyRates
      ? props.labels.filteredEmptyTitle
      : props.labels.emptyTitle;
    const description = props.hasAnyCurrencyRates
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
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[35%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.date}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.base}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.rateCount}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.updatedAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const isExpanded = props.expandedDate === item.date;
              const rates = isExpanded ? props.expandedRates : null;
              return (
                <Fragment key={item.date}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm text-text">{item.date}</td>
                    <td className="px-6 py-4 text-sm text-text">{item.base}</td>
                    <td className="px-6 py-4 text-sm text-text">{item.rateCount}</td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.updatedAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/currency-rates"
                            : `/admin/currency-rates?detail=${encodeURIComponent(item.date)}${
                                props.currentCursor
                                  ? `&cursor=${encodeURIComponent(props.currentCursor)}`
                                  : ""
                              }`
                        }
                        prefetch={false}
                        scroll={false}
                        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
                      >
                        {isExpanded ? props.labels.hideDetails : props.labels.details}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded && rates != null ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={5} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.date}</h3>
                            <p className="mt-1 text-sm text-muted">{item.date}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.base}</h3>
                            <p className="mt-1 text-sm text-muted">{item.base}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.rates}</h3>
                            <pre className="mt-1 overflow-x-auto rounded-md bg-surface p-3 text-xs text-muted">
                              {JSON.stringify(rates, null, 2)}
                            </pre>
                          </div>
                        </div>
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
            href={buildNextPageHref(props.nextCursor)}
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
