"use client";

import { Fragment, useMemo } from "react";
import { Link } from "@/i18n/routing";
import type { AdminUserListItem } from "@/modules/admin/contracts";
import { UserRole } from "@/modules/admin/types";
import { AdminUserDetailPanel } from "./AdminUserDetailPanel";

export interface AdminUsersListLabels {
  title: string;
  description: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  details: string;
  detailsColumn: string;
  hideDetails: string;
  userId: string;
  emailVerified: string;
  image: string;
  updatedAt: string;
  deletedAt: string;
  emptyTitle: string;
  emptyDescription: string;
  roleUser: string;
  roleSuperAdmin: string;
  notAvailable: string;
  profile?: string;
  timestamps?: string;
}

function formatRole(role: AdminUserListItem["role"], labels: AdminUsersListLabels): string {
  return role === UserRole.SuperAdmin ? labels.roleSuperAdmin : labels.roleUser;
}

function buildUserDetailHref(userId: string | null): string {
  if (userId == null) {
    return "/admin/users";
  }

  return `/admin/users?detail=${encodeURIComponent(userId)}`;
}

export function AdminUsersList(props: {
  locale: string;
  users: AdminUserListItem[];
  expandedUserId?: string | null;
  labels: AdminUsersListLabels;
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

  if (props.users.length === 0) {
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
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.email}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.name}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.role}
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
            {props.users.map((user) => {
              const isExpanded = props.expandedUserId === user.id;

              return (
                <Fragment key={user.id}>
                  <tr className="border-b border-border align-top">
                    <td className="px-6 py-4 text-sm font-medium text-text">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-text">{user.name ?? ""}</td>
                    <td className="px-6 py-4 text-sm text-text">
                      <span className="inline-flex rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-medium text-text">
                        {formatRole(user.role, props.labels)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {dateFormatter.format(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <Link
                        href={buildUserDetailHref(isExpanded ? null : user.id)}
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
                      <td colSpan={5} className="border-t border-border bg-surface2 px-6 py-4">
                        <AdminUserDetailPanel
                          locale={props.locale}
                          detail={user}
                          labels={{
                            profile: props.labels.profile ?? "Profile",
                            timestamps: props.labels.timestamps ?? "Timestamps",
                            userId: props.labels.userId,
                            email: props.labels.email,
                            name: props.labels.name,
                            role: props.labels.role,
                            emailVerified: props.labels.emailVerified,
                            image: props.labels.image,
                            createdAt: props.labels.createdAt,
                            updatedAt: props.labels.updatedAt,
                            deletedAt: props.labels.deletedAt,
                            roleUser: props.labels.roleUser,
                            roleSuperAdmin: props.labels.roleSuperAdmin,
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
    </section>
  );
}
