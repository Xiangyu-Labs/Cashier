import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { eq, and, gte, lte, or, isNull } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().positive().optional().default(50),
  offset: z.coerce.number().nonnegative().optional().default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/transactions - 获取交易列表
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: ledgerId } = await params;
    const searchParams = request.nextUrl.searchParams;

    const query = querySchema.parse({
      categoryId: searchParams.get("categoryId") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    const conditions = [eq(transactions.ledgerId, ledgerId)];

    if (query.categoryId) {
      conditions.push(eq(transactions.categoryId, query.categoryId));
    }

    if (query.startDate) {
      const startDate = new Date(query.startDate);
      const dateCondition = or(
        gte(transactions.transactionDate, startDate),
        and(
          isNull(transactions.transactionDate),
          gte(transactions.createdAt, startDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      const dateCondition = or(
        lte(transactions.transactionDate, endDate),
        and(
          isNull(transactions.transactionDate),
          lte(transactions.createdAt, endDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    const result = await db.query.transactions.findMany({
      where: and(...conditions),
      with: {
        category: true,
        inputMessage: true,
      },
      orderBy: (transactions, { desc }) => [desc(transactions.createdAt)],
      limit: query.limit,
      offset: query.offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
