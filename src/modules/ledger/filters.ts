import type { SourceDocumentProcessingStatus } from "@/modules/source-document/types";

export interface EntryFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  statuses?: SourceDocumentProcessingStatus[];
  search?: string | null;
}

export interface LedgerEntryFilterParams {
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  uncategorizedOnly?: boolean;
  currency?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  search?: string | null;
}

export const STREAM_STATUS_PRESETS = ["needs_attention", "in_progress"] as const;
export type StreamStatusPreset = (typeof STREAM_STATUS_PRESETS)[number];

export const STREAM_STATUS_PRESET_VALUES: Record<
  StreamStatusPreset,
  SourceDocumentProcessingStatus[]
> = {
  needs_attention: ["failed", "cancelled"],
  in_progress: ["processing"],
};
