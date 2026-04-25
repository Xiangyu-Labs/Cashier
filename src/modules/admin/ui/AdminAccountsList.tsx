"use client";

import { Fragment } from "react";
import { Link } from "@/i18n/routing";
import type { AdminAccountListItem } from "@/modules/admin/contracts";

export interface AdminAccountsListLabels {
  title: string;
  description: string;
  provider: string;
  providerAccountId: string;
  type: string;
  user: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  userId: string;
  userEmail: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: string;
  tokenType: string;
  scope: string;
  idToken: string;
  sessionState: string;
  notAvailable: string;
}

function truncate(value: string | null, maxLength = 30): string {
  if (value == null) return "—";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function AdminAccountsList(props: {
  items: AdminAccountListItem[];
  hasAnyAccounts: boolean;
  expandedAccountKey?: string | null;
  labels: AdminAccountsListLabels;
}) {
  if (props.items.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{props.labels.emptyTitle}</h2>
          <p className="text-sm text-muted">{props.labels.emptyDescription}</p>
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
            <col className="w-[15%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.provider}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.providerAccountId}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.type}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.user}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.userId}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.detailsColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const accountKey = `${item.provider}:${item.providerAccountId}`;
              const isExpanded = props.expandedAccountKey === accountKey;
              return (
                <Fragment key={accountKey}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm text-text">{item.provider}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {truncate(item.providerAccountId)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">{item.type}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">
                      {item.userEmail ?? props.labels.notAvailable}
                    </td>
                    <td className="break-all px-6 py-4 text-sm text-muted">{item.userId}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/accounts"
                            : `/admin/accounts?detail=${encodeURIComponent(accountKey)}`
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
                      <td colSpan={6} className="border-t border-border bg-surface2 px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.provider}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{item.provider}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.providerAccountId}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{item.providerAccountId}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.userId}
                            </h3>
                            <p className="mt-1 text-sm text-muted">{item.userId}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.userEmail}
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                              {item.userEmail ?? props.labels.notAvailable}
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
    </section>
  );
}
