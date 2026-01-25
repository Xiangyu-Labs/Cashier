import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";

const confirmSchema = z.object({
  transactionIds: z.array(z.string().uuid()).optional(),
  confirmAll: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/ledgers/[id]/transactions/confirm - 批量确认交易
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const body = await request.json();
    const validated = confirmSchema.parse(body);

    let updatedCount = 0;

    if (validated.confirmAll) {
      // 确认所有 pending 交易
      const result = await db
        .update(transactions)
        .set({ status: "confirmed" })
        .where(
          and(
            eq(transactions.ledgerId, ledgerId),
            eq(transactions.status, "pending")
          )
        )
        .returning();
      updatedCount = result.length;
    } else if (validated.transactionIds && validated.transactionIds.length > 0) {
      // 确认指定的交易
      const result = await db
        .update(transactions)
        .set({ status: "confirmed" })
        .where(
          and(
            eq(transactions.ledgerId, ledgerId),
            inArray(transactions.id, validated.transactionIds)
          )
        )
        .returning();
      updatedCount = result.length;
    }

    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to confirm transactions:", error);
    return NextResponse.json(
      { error: "Failed to confirm transactions" },
      { status: 500 }
    );
  }
}
