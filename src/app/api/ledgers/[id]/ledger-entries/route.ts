import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { eq, and, gte, lte, or, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/lib/auth/helpers";

const querySchema = z.object({
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().positive().optional().default(50),
  offset: z.coerce.number().nonnegative().optional().default(0),
  cursor: z.string().optional(), // entryDate or createdAt timestamp
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/ledger-entries - 获取账项列表
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: ledgerId } = await params;

    // Verify user owns this ledger
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error) return error;
    const searchParams = request.nextUrl.searchParams;

    const query = querySchema.parse({
      categoryId: searchParams.get("categoryId") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    const conditions = [];

    if (query.categoryId) {
      conditions.push(eq(ledgerEntries.categoryId, query.categoryId));
    }

    if (query.startDate) {
      const startDate = new Date(query.startDate);
      const dateCondition = or(
        gte(ledgerEntries.entryDate, startDate),
        and(
          isNull(ledgerEntries.entryDate),
          gte(ledgerEntries.createdAt, startDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      const dateCondition = or(
        lte(ledgerEntries.entryDate, endDate),
        and(
          isNull(ledgerEntries.entryDate),
          lte(ledgerEntries.createdAt, endDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    // Cursor-based pagination logic
    if (query.cursor) {
      const cursorDate = new Date(query.cursor);
      const dateCondition = or(
        lt(ledgerEntries.entryDate, cursorDate),
        and(
          isNull(ledgerEntries.entryDate),
          lt(ledgerEntries.createdAt, cursorDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    const result = await scope.entries.findMany({
      where: and(...conditions),
      with: {
        category: true,
        sourceDocument: true,
      },
      orderBy: (ledgerEntries, { desc }) => [desc(ledgerEntries.entryDate), desc(ledgerEntries.createdAt)],
      limit: query.limit + 1,
      offset: query.offset,
    });

    let nextCursor = null;
    if (result.length > query.limit) {
      const nextItem = result.pop();
      if (nextItem) {
        const nextDate = nextItem.entryDate || nextItem.createdAt;
        nextCursor = new Date(nextDate).toISOString();
      }
    }

    return NextResponse.json({
      items: result,
      nextCursor
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ error }, "Failed to fetch ledger entries");
    return NextResponse.json(
      { error: "Failed to fetch ledger entries" },
      { status: 500 }
    );
  }
}
