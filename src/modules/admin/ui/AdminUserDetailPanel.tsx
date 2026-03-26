"use client";

import { useMemo } from "react";
import type { AdminUserListItem } from "@/modules/admin/contracts";
import { UserRole } from "@/modules/admin/types";

export interface AdminUserDetailPanelLabels {
  profile: string;
  timestamps: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  emailVerified: string;
  image: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  roleUser: string;
  roleSuperAdmin: string;
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

function formatRole(role: AdminUserListItem["role"], labels: AdminUserDetailPanelLabels): string {
  return role === UserRole.SuperAdmin ? labels.roleSuperAdmin : labels.roleUser;
}

function Field(props: { label: string; value: string; breakAll?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{props.label}</dt>
      <dd className={`mt-1 text-sm text-text ${props.breakAll ? "break-all" : ""}`.trim()}>
        {props.value}
      </dd>
    </div>
  );
}

export function AdminUserDetailPanel(props: {
  locale: string;
  detail: AdminUserListItem;
  labels: AdminUserDetailPanelLabels;
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
        <h3 className="text-sm font-semibold text-text">{props.labels.profile}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={props.labels.userId} value={props.detail.id} breakAll />
          <Field label={props.labels.email} value={props.detail.email} breakAll />
          <Field
            label={props.labels.name}
            value={formatScalar(props.detail.name, props.labels.notAvailable)}
          />
          <Field label={props.labels.role} value={formatRole(props.detail.role, props.labels)} />
          <Field
            label={props.labels.emailVerified}
            value={formatDate(props.detail.emailVerified, dateFormatter, props.labels.notAvailable)}
          />
          <Field
            label={props.labels.image}
            value={formatScalar(props.detail.image, props.labels.notAvailable)}
            breakAll
          />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{props.labels.timestamps}</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label={props.labels.createdAt}
            value={formatDate(props.detail.createdAt, dateFormatter, props.labels.notAvailable)}
          />
          <Field
            label={props.labels.updatedAt}
            value={formatDate(props.detail.updatedAt, dateFormatter, props.labels.notAvailable)}
          />
          <Field
            label={props.labels.deletedAt}
            value={formatDate(props.detail.deletedAt, dateFormatter, props.labels.notAvailable)}
          />
        </dl>
      </section>
    </div>
  );
}
