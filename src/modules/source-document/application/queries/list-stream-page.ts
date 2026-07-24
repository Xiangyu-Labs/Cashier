import { currentApplication } from "@/application/current";
import type { SourceDocumentListItemDto, StreamPage } from "../../contracts";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";

export interface ListStreamPageInput {
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  minAmount?: number;
  maxAmount?: number;
  statuses?: string[];
  cursor?: string | null | undefined;
  limit: number;
}

/**
 * Strip the version prefix from a stream cursor to get the inner cursor.
 */
function stripVersionPrefix(cursor: string | null | undefined): string | null {
  if (cursor == null || cursor === "") return null;
  if (cursor.startsWith("v1|")) return cursor.slice(3);
  return null;
}

/**
 * Prepend the version prefix to a raw cursor.
 */
function addVersionPrefix(cursor: string | null): string | null {
  if (cursor == null) return null;
  return `v1|${cursor}`;
}

export async function listStreamPage(
  ledgerId: string,
  input: ListStreamPageInput
): Promise<StreamPage> {
  const cursor = stripVersionPrefix(input.cursor);

  const page = await currentApplication.sourceDocumentReads.list({
    ledgerId,
    ...(input.statuses != null && input.statuses.length > 0 ? { statuses: input.statuses as unknown as SourceDocumentStatusType[] } : {}),
    ...(input.startDate != null && input.startDate !== "" ? { startDate: input.startDate } : {}),
    ...(input.endDate != null && input.endDate !== "" ? { endDate: input.endDate } : {}),
    ...(input.minAmount != null ? { minAmount: input.minAmount } : {}),
    ...(input.maxAmount != null ? { maxAmount: input.maxAmount } : {}),
    ...(cursor != null ? { cursor } : {}),
    limit: input.limit,
  });

  return {
    items: page.items as SourceDocumentListItemDto[],
    nextCursor: addVersionPrefix(page.nextCursor),
    generation: 1,
  };
}
