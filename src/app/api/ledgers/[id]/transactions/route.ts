import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, receipts, categories } from "@/lib/db/schema";
import { eq, and, gte, lte, or, isNull } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().positive().optional().default(50),
  offset: z.coerce.number().nonnegative().optional().default(0),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingTransactions: any[] = [];

      interface ProposedTransaction {
        category?: string;
        amount?: number | string;
        currency?: string;
        itemName?: string;
        notes?: string;
        transactionDate?: string;
      }

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
      pendingTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return NextResponse.json(pendingTransactions);
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

    const result = await db.query.transactions.findMany({
      where: and(...conditions),
      with: {
        category: true,
        receipt: true,
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
