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
import type { AdminEntryCategoryOption, AdminEntryRange, AdminEntrySourceLink } from "@/modules/admin/contracts";

export interface AdminEntryFiltersState {
  range: AdminEntryRange;
  currency?: string;
  categoryId?: string;
  sourceLink: AdminEntrySourceLink;
  limit?: string;
}

export interface AdminEntryFiltersLabels {
  range: string;
  currency: string;
  category: string;
  sourceLink: string;
  allCurrencies: string;
  allCategories: string;
  allSourceLinks: string;
  range24h: string;
  range7d: string;
  range30d: string;
  rangeAll: string;
  sourceLinked: string;
  sourceUnlinked: string;
  resetFilters: string;
}

const rangeOptions: Array<{ value: AdminEntryRange; key: keyof AdminEntryFiltersLabels }> = [
  { value: "24h", key: "range24h" },
  { value: "7d", key: "range7d" },
  { value: "30d", key: "range30d" },
  { value: "all", key: "rangeAll" },
];

const sourceLinkOptions: Array<{ value: AdminEntrySourceLink; key: keyof AdminEntryFiltersLabels }> = [
  { value: "all", key: "allSourceLinks" },
  { value: "linked", key: "sourceLinked" },
  { value: "unlinked", key: "sourceUnlinked" },
];

export function AdminEntryFilters(props: {
  availableCurrencies: string[];
  availableCategories: AdminEntryCategoryOption[];
  filters: AdminEntryFiltersState;
  labels: AdminEntryFiltersLabels;
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

  const rangeLabel = props.labels[
    rangeOptions.find((option) => option.value === props.filters.range)?.key ?? "rangeAll"
  ];
  const sourceLinkLabel = props.labels[
    sourceLinkOptions.find((option) => option.value === props.filters.sourceLink)?.key ?? "allSourceLinks"
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{props.labels.range}</p>
          <Select value={props.filters.range} onValueChange={(value) => replaceFilters({ range: value })}>
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

        <div className="flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{props.labels.currency}</p>
          <Select
            value={props.filters.currency ?? "all"}
            onValueChange={(value) => replaceFilters({ currency: value === "all" ? null : value })}
          >
            <SelectTrigger className="w-full justify-between bg-surface2/60">
              <SelectValue placeholder={props.filters.currency ?? props.labels.allCurrencies} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{props.labels.allCurrencies}</SelectItem>
              {props.availableCurrencies.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{props.labels.category}</p>
          <Select
            value={props.filters.categoryId ?? "all"}
            onValueChange={(value) => replaceFilters({ categoryId: value === "all" ? null : value })}
          >
            <SelectTrigger className="w-full justify-between bg-surface2/60">
              <SelectValue
                placeholder={
                  props.availableCategories.find((category) => category.id === props.filters.categoryId)?.name ??
                  props.labels.allCategories
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{props.labels.allCategories}</SelectItem>
              {props.availableCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{props.labels.sourceLink}</p>
          <Select
            value={props.filters.sourceLink}
            onValueChange={(value) => replaceFilters({ sourceLink: value })}
          >
            <SelectTrigger className="w-full justify-between bg-surface2/60">
              <SelectValue placeholder={sourceLinkLabel} />
            </SelectTrigger>
            <SelectContent>
              {sourceLinkOptions.map((option) => (
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
          onClick={() =>
            replaceFilters({
              range: null,
              currency: null,
              categoryId: null,
              sourceLink: null,
              cursor: null,
            })
          }
        >
          {props.labels.resetFilters}
        </button>
      </div>
    </section>
  );
}
