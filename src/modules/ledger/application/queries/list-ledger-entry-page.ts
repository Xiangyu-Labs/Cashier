import { and } from "drizzle-orm";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { mapLedgerEntryDto } from "../mappers";
import {
  buildLedgerEntryCursorCondition,
  buildLedgerEntryFilterConditions,
  type LedgerEntryFilterParams,
} from "./build-ledger-entry-filters";

interface ListLedgerEntryPageInput {
  ledgerId: string;
  limit?: number;
  cursor?: string | null;
  filters: LedgerEntryFilterParams;
}

export async function listLedgerEntryPage({
  ledgerId,
  limit = 20,
  cursor,
  filters,
}: ListLedgerEntryPageInput) {
  const conditions = buildLedgerEntryFilterConditions(ledgerId, filters);
  const cursorCondition = buildLedgerEntryCursorCondition(cursor);
  if (cursorCondition != null) {
    conditions.push(cursorCondition);
  }

  const rows = await db.query.ledgerEntries.findMany({
    where: and(...conditions),
    orderBy: (entries, { desc }) => [desc(entries.createdAt), desc(entries.id)],
    limit: limit + 1,
    with: {
      category: true,
      sourceDocument: true,
    },
  });

  let nextCursor: string | undefined;
  let pagedRows = rows;
  if (rows.length > limit) {
    const nextItem = rows[limit];
    if (nextItem == null) {
      throw new AppError(
        "Expected next ledger entry page cursor row",
        "INVARIANT_VIOLATION"
      );
    }
    nextCursor = `${nextItem.createdAt.toISOString()}|${nextItem.id}`;
    pagedRows = rows.slice(0, limit);
  }

  const items = pagedRows.map((row) => {
    const dto = mapLedgerEntryDto({
      ...row,
      category: row.category,
      sourceDocument: row.sourceDocument,
    });

    if (dto.sourceDocument != null) {
      const {
        visionDescription: _visionDescription,
        originalImageUrls: _originalImageUrls,
        ...lightMetadata
      } = dto.sourceDocument.metadata ?? {};

      dto.sourceDocument = {
        ...dto.sourceDocument,
        metadata: lightMetadata,
        imageUrls: [],
        hasImages: (row.sourceDocument?.imageUrls?.length ?? 0) > 0,
      };
    }

    return dto;
  });

  return {
    items,
    nextCursor,
  };
}
