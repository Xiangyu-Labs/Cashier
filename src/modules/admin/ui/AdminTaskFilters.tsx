"use client";

import { usePathname, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminTaskRange, AdminTaskStatus } from "@/modules/admin/contracts";

export interface AdminTaskFiltersState {
  status?: AdminTaskStatus;
  type?: string;
  range: AdminTaskRange;
  limit?: string;
}

export interface AdminTaskFiltersLabels {
  status: string;
  type: string;
  range: string;
  allStatuses: string;
  allTypes: string;
  statusPending: string;
  statusRunning: string;
  statusCompleted: string;
  statusFailed: string;
  statusCancelled: string;
  range24h: string;
  range7d: string;
  range30d: string;
  rangeAll: string;
  resetFilters: string;
}

const statusOptions: Array<{ value: AdminTaskStatus | "all"; key: keyof AdminTaskFiltersLabels }> = [
  { value: "all", key: "allStatuses" },
  { value: "failed", key: "statusFailed" },
  { value: "running", key: "statusRunning" },
  { value: "pending", key: "statusPending" },
  { value: "completed", key: "statusCompleted" },
  { value: "cancelled", key: "statusCancelled" },
];

const rangeOptions: Array<{ value: AdminTaskRange; key: keyof AdminTaskFiltersLabels }> = [
  { value: "24h", key: "range24h" },
  { value: "7d", key: "range7d" },
  { value: "30d", key: "range30d" },
  { value: "all", key: "rangeAll" },
];

export function AdminTaskFilters(props: {
  availableTypes: string[];
  filters: AdminTaskFiltersState;
  labels: AdminTaskFiltersLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const replaceFilters = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    params.delete("cursor");
    params.delete("detail");

    const query = params.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  const selectedStatus = props.filters.status ?? "all";
  const selectedRange = props.filters.range;

  const statusLabel = props.labels[
    statusOptions.find((option) => option.value === selectedStatus)?.key ?? "allStatuses"
  ];
  const rangeLabel = props.labels[
    rangeOptions.find((option) => option.value === selectedRange)?.key ?? "rangeAll"
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{props.labels.status}</p>
          <Select
            value={selectedStatus}
            onValueChange={(value) => replaceFilters({ status: value === "all" ? null : value })}
          >
            <SelectTrigger className="w-full justify-between bg-surface2/60">
              <SelectValue placeholder={statusLabel} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {props.labels[option.key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{props.labels.type}</p>
          <Select
            value={props.filters.type ?? "all"}
            onValueChange={(value) => replaceFilters({ type: value === "all" ? null : value })}
          >
            <SelectTrigger className="w-full justify-between bg-surface2/60">
              <SelectValue placeholder={props.filters.type ?? props.labels.allTypes} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{props.labels.allTypes}</SelectItem>
              {props.availableTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{props.labels.range}</p>
          <Select value={selectedRange} onValueChange={(value) => replaceFilters({ range: value })}>
            <SelectTrigger className="w-full justify-between bg-surface2/60">
              <SelectValue placeholder={rangeLabel} />
            </SelectTrigger>
            <SelectContent>
              {rangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {props.labels[option.key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          type="button"
          className="h-9 rounded-md border border-border px-3 text-sm text-text transition-colors hover:bg-surface2"
          onClick={() => replaceFilters({ status: null, type: null, range: null, cursor: null })}
        >
          {props.labels.resetFilters}
        </button>
      </div>
    </section>
  );
}
