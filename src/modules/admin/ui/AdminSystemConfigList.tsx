"use client";

import type { AdminSystemConfigItem } from "@/modules/admin/contracts";

export interface AdminSystemConfigListLabels {
  title: string;
  description: string;
  readOnlyNotice: string;
  name: string;
  tier: string;
  source: string;
  required: string;
  value: string;
  descriptionColumn: string;
  emptyTitle: string;
  emptyDescription: string;
  tierSystem: string;
  tierRuntime: string;
  sourceEnvironment: string;
  sourceDefault: string;
  sourceMissing: string;
  requiredYes: string;
  requiredNo: string;
  notSet: string;
}

function formatTier(
  tier: AdminSystemConfigItem["tier"],
  labels: AdminSystemConfigListLabels
): string {
  return tier === "system" ? labels.tierSystem : labels.tierRuntime;
}

function formatSource(
  source: AdminSystemConfigItem["source"],
  labels: AdminSystemConfigListLabels
): string {
  switch (source) {
    case "environment":
      return labels.sourceEnvironment;
    case "default":
      return labels.sourceDefault;
    case "missing":
      return labels.sourceMissing;
    default:
      return source;
  }
}

function formatRequired(
  required: AdminSystemConfigItem["required"],
  labels: AdminSystemConfigListLabels
): string {
  return required ? labels.requiredYes : labels.requiredNo;
}

export function AdminSystemConfigList(props: {
  locale: string;
  items: AdminSystemConfigItem[];
  labels: AdminSystemConfigListLabels;
}) {
  void props.locale;

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
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
          {props.labels.readOnlyNotice}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.name}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.tier}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.source}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.required}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.value}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.descriptionColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => (
              <tr key={item.name} className="border-b border-border align-top last:border-b-0">
                <td className="break-all px-6 py-4 text-sm font-medium text-text">{item.name}</td>
                <td className="px-6 py-4 text-sm text-text">
                  {formatTier(item.tier, props.labels)}
                </td>
                <td className="px-6 py-4 text-sm text-text">
                  {formatSource(item.source, props.labels)}
                </td>
                <td className="px-6 py-4 text-sm text-text">
                  {formatRequired(item.required, props.labels)}
                </td>
                <td className="break-all px-6 py-4 text-sm text-text">
                  {item.value ?? props.labels.notSet}
                </td>
                <td className="break-all px-6 py-4 text-sm text-muted">{item.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
