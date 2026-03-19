import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";

// Kept for AdaptiveHeatmap, which still needs lightweight date formatting/parsing helpers.
export const formatDate = formatDateTimeForApi;
export const parseDate = parseDateString;
