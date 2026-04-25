import type { ReactNode } from "react";
import { Link } from "@/i18n/routing";

export function AdminOverviewStatCard(props: {
  href: string;
  label: string;
  value: number;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={props.href}
      className="flex flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface2"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{props.label}</span>
        {props.icon != null ? <span className="text-muted">{props.icon}</span> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold text-text">{props.value.toLocaleString()}</p>
    </Link>
  );
}
