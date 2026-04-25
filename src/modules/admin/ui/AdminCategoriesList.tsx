"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminCategoryListItem } from "@/modules/admin/contracts";

export interface AdminCategoriesListLabels {
  title: string;
  description: string;
  id: string;
  ledgerId: string;
  name: string;
  descriptionColumn: string;
  sortOrder: string;
  isEditable: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
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

export function AdminCategoriesList(props: {
  locale: string;
  items: AdminCategoryListItem[];
  hasAnyCategories: boolean;
  expandedCategoryId?: string | null;
  labels: AdminCategoriesListLabels;
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
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.id}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.ledgerId}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.name}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.sortOrder}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.isEditable}
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
              const isExpanded = props.expandedCategoryId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-border align-top">
                    <td className="break-all px-6 py-4 text-sm text-text">{item.id}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.ledgerId}</td>
                    <td className="break-all px-6 py-4 text-sm text-text">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-text">{item.sortOrder}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      {item.isEditable ? props.labels.yes : props.labels.no}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatOptionalDate(item.createdAt, dateFormatter)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={
                          isExpanded
                            ? "/admin/categories"
                            : `/admin/categories?detail=${encodeURIComponent(item.id)}`
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
                            <h3 className="text-sm font-semibold text-text">{props.labels.name}</h3>
                            <p className="mt-1 text-sm text-muted">{item.name}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              {props.labels.descriptionColumn}
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                              {item.description ?? props.labels.notAvailable}
                            </p>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-text">{props.labels.icon}</h3>
                            <p className="mt-1 text-sm text-muted">
                              {(item as unknown as { icon?: string | null }).icon ?? props.labels.notAvailable}
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
