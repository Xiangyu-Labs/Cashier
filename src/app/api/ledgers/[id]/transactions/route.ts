import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, receipts, categories } from "@/lib/db/schema";
import { eq, and, gte, lte, or, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().positive().optional().default(50),
  offset: z.coerce.number().nonnegative().optional().default(0),
  cursor: z.string().optional(), // transactionDate or createdAt timestamp
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(["pending", "confirmed"]).optional(),
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
      cursor: searchParams.get("cursor") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      status: searchParams.get("status") || undefined,
    });

    // If querying for pending transactions, fetch from receipts
    if (query.status === "pending") {
      // 1. Fetch receipts with 'to_confirm' status
      const pendingReceipts = await db.query.receipts.findMany({
        where: and(
          eq(receipts.ledgerId, ledgerId),
          eq(receipts.status, "to_confirm")
        ),
        orderBy: (receipts, { desc }) => [desc(receipts.createdAt)],
      });

      // 2. Fetch all categories for mapping
      const allCategories = await db.query.categories.findMany({
        where: eq(categories.ledgerId, ledgerId),
      });

      // 3. Map to Transaction objects
      interface ProposedTransaction {
        category?: string;
        amount?: number | string;
        currency?: string;
        itemName?: string;
        notes?: string;
        transactionDate?: string;
      }

      interface PendingTransaction {
        id: string;
        ledgerId: string;
        categoryId: string | null;
        receiptId: string;
        amount: string;
        currency: string;
        itemName: string;
        description: string | null;
        transactionDate: Date;
        createdAt: Date;
        updatedAt: Date;
        category: unknown;
        receipt: unknown;
      }

      const pendingTransactions: PendingTransaction[] = [];

      for (const receipt of pendingReceipts) {
        if (!receipt.proposedTransactions || !Array.isArray(receipt.proposedTransactions)) continue;

        const proposedTxs = receipt.proposedTransactions as unknown as ProposedTransaction[];

        proposedTxs.forEach((ptx, index) => {
          // Find category object
          const categoryName = ptx.category;
          const category = allCategories.find(c => c.name === categoryName) || null;

          pendingTransactions.push({
            id: `pending:${receipt.id}:${index}`, // Synthesized ID
            ledgerId: receipt.ledgerId,
            categoryId: category?.id || null,
            receiptId: receipt.id,
            amount: ptx.amount?.toString() || "0",
            currency: ptx.currency || "CNY",
            itemName: ptx.itemName || "未分类",
            description: ptx.notes || null,
            transactionDate: ptx.transactionDate ? new Date(ptx.transactionDate) : receipt.createdAt,
            createdAt: receipt.createdAt,
            updatedAt: receipt.createdAt,
            // Relations
            category: category,
            receipt: receipt,
          });
        });
      }

      // Sort by createdAt desc (or custom sort if needed)
      pendingTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return NextResponse.json({ items: pendingTransactions });
    }

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

    // Cursor-based pagination logic
    if (query.cursor) {
      const cursorDate = new Date(query.cursor);
      // We prioritize transactionDate, but fallback to createdAt.
      // Since we sort by transactionDate desc (mostly), the cursor should target that.
      // However, transactions can have null transactionDate.
      // The sort logic is complex: date desc, then createdAt desc.
      // Simplifying assumption: We use a simple cursor on the effective date.

      const dateCondition = or(
        lt(transactions.transactionDate, cursorDate),
        and(
          isNull(transactions.transactionDate),
          lt(transactions.createdAt, cursorDate)
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
        receipt: true,
      },
      orderBy: (transactions, { desc }) => [desc(transactions.transactionDate), desc(transactions.createdAt)],
      limit: query.limit + 1, // Fetch one extra to check for next page
      offset: query.offset,
    });

    let nextCursor = null;
    if (result.length > query.limit) {
      const nextItem = result.pop(); // Remove extra item
      if (nextItem) {
        // Use the effective date for cursor
        const nextDate = nextItem.transactionDate || nextItem.createdAt;
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
    logger.error({ error }, "Failed to fetch transactions");
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
