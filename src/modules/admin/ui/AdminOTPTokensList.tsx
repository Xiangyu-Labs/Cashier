"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminOTPTokenListItem } from "@/modules/admin/contracts";

export interface AdminOTPTokensListLabels {
  title: string;
  description: string;
  email: string;
  expires: string;
  attempts: string;
  isVerified: string;
  ipAddress: string;
  createdAt: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  nextPage: string;
  tokenHash: string;
  lockedUntil: string;
  lastAttemptAt: string;
  verifiedAt: string;
  notAvailable: string;
  yes: string;
  no: string;
}

function formatOptionalDate(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  emptySymbol = "—"
): string {
  return value == null ? emptySymbol : formatter.format(value);
}

function truncate(value: string, maxLength = 20): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function buildNextPageHref(nextCursor: string): string {
  return `/admin/otp-tokens?cursor=${encodeURIComponent(nextCursor)}`;
}

export function AdminOTPTokensList(props: {
  locale: string;
  items: AdminOTPTokenListItem[];
  hasAnyOTPTokens: boolean;
  nextCursor: string | null;
  currentCursor?: string | null;
  expandedTokenId?: string | null;
  labels: AdminOTPTokensListLabels;
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
    const title = props.hasAnyOTPTokens
      ? props.labels.filteredEmptyTitle
      : props.labels.emptyTitle;
    const description = props.hasAnyOTPTokens
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
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.email}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.expires}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.attempts}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.isVerified}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.ipAddress}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const isExpanded = props.expandedTokenId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="break-all px-6 py-4 text-sm text-text">{item.email}</td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.expires, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{item.attempts}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      {item.isVerified ? props.labels.yes : props.labels.no}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {item.ipAddress ?? props.labels.notAvailable}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/otp-tokens"
                            : `/admin/otp-tokens?detail=${encodeURIComponent(item.id)}${
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
                  {isExpanded ? (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={7} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.email}</h3>
                            <p className="mt-1 text-sm text-muted">{item.email}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.tokenHash}</h3>
                            <p className="mt-1 text-sm text-muted">{truncate(item.id)}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.expires}</h3>
                            <p className="mt-1 text-sm text-muted">
                              {formatOptionalDate(item.expires, dateFormatter)}
                            </p>
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
