import type { PeriodParams, PeriodPreset } from "@/lib/period-utils";

/**
 * The date axis the filter panel offers. Four choices, in the order they are
 * painted: the two months a ledger is usually read by, everything, and a
 * hand-picked range.
 *
 * A named range the panel cannot express (a ledger opened on `?period=week`)
 * resolves to `custom`, so the panel shows the real start and end instead of
 * highlighting nothing.
 */
export const ENTRY_FILTER_PRESETS = ["thisMonth", "lastMonth", "all", "custom"] as const;

export type EntryFilterPreset = (typeof ENTRY_FILTER_PRESETS)[number];

export function isEntryFilterPreset(period: PeriodPreset): period is EntryFilterPreset {
  return (ENTRY_FILTER_PRESETS as readonly PeriodPreset[]).includes(period);
}

/** Which preset the panel and the toolbar range label treat as active. */
export function resolveActivePreset(periodParams: PeriodParams): EntryFilterPreset {
  return isEntryFilterPreset(periodParams.period) ? periodParams.period : "custom";
}
