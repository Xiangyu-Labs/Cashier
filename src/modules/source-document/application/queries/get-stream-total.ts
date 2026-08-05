import type { SourceDocumentReadPort } from "../ports";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import type { StreamTotalDto } from "../../contracts";
import { normalizeSearchTerm } from "@/lib/search";

export interface GetStreamTotalInput {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  statuses?: readonly SourceDocumentStatusType[];
  search?: string;
}

export async function getStreamTotal(
  ledgerId: string,
  input: GetStreamTotalInput = {},
  documents: SourceDocumentReadPort
): Promise<StreamTotalDto> {
  if (
    input.statuses != null &&
    input.statuses.length > 0 &&
    !input.statuses.some((status) => status === "completed" || status === "duplicate_pending")
  ) {
    return { total: "0" };
  }

  const search = normalizeSearchTerm(input.search);
  const filters = { ...input };
  delete filters.search;
  return documents.calculateCompletedTotal({
    ledgerId,
    ...filters,
    ...(search != null ? { search } : {}),
  });
}
