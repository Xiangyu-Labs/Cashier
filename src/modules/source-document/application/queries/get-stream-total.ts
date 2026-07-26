import { currentApplication } from "@/application/current";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import type { StreamTotalDto } from "../../contracts";

export interface GetStreamTotalInput {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  statuses?: readonly SourceDocumentStatusType[];
}

export async function getStreamTotal(
  ledgerId: string,
  input: GetStreamTotalInput = {}
): Promise<StreamTotalDto> {
  if (
    input.statuses != null &&
    input.statuses.length > 0 &&
    !input.statuses.includes("completed")
  ) {
    return { total: "0" };
  }

  return currentApplication.sourceDocumentReads.calculateCompletedTotal({
    ledgerId,
    ...input,
  });
}
