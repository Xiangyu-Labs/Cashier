import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  status: z.enum(["pending", "confirmed"]).optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().positive().optional().default(50),
  offset: z.coerce.number().nonnegative().optional().default(0),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/transactions - 获取交易列表
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const searchParams = request.nextUrl.searchParams;

    const query = querySchema.parse({
      status: searchParams.get("status") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    });

    const conditions = [eq(transactions.ledgerId, ledgerId)];

    if (query.status) {
      conditions.push(eq(transactions.status, query.status));
    }
    if (query.categoryId) {
      conditions.push(eq(transactions.categoryId, query.categoryId));
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
