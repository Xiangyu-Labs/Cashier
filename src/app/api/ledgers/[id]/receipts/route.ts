import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receipts, ledgers, categories, transactions } from "@/lib/db/schema";
import { eq, inArray, and, asc } from "drizzle-orm";
import { z } from "zod";

import { processReceiptQueue } from "@/lib/queue";

const messageSchema = z.object({
  text: z.string().optional(),
  images: z
    .array(
      z.object({
        data: z.string(),
        mimeType: z.string(),
      })
    )
    .optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/receipts - 获取消息列表 (主要用于获取队列中的消息)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: ledgerId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status"); // e.g. "queued,processing"

  const conditions = [eq(receipts.ledgerId, ledgerId)];

  if (status) {
    // Validate or cast to allowed status values
    const statuses = status.split(",") as ("queued" | "processing" | "to_confirm" | "completed" | "failed" | "invalid")[];
    conditions.push(inArray(receipts.status, statuses));
  }

  const result = await db.query.receipts.findMany({
    where: and(...conditions),
    orderBy: [asc(receipts.createdAt)],
  });

  return NextResponse.json(result);
}

// POST /api/ledgers/[id]/receipts - 处理多模态输入
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const body = await request.json();
    const validated = messageSchema.parse(body);

    if (!validated.text && (!validated.images || validated.images.length === 0)) {
      return NextResponse.json(
        { error: "At least one input (text or images) is required" },
        { status: 400 }
      );
    }

    const ledger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });

    if (!ledger) {
      return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    }

    // Normalize images
    const imageUrls: string[] = [];
    if (validated.images) {
      validated.images.forEach((img) => {
        let data = img.data;
        if (!data.startsWith("data:") && !data.startsWith("http")) {
          data = `data:image/jpeg;base64,${data}`;
        }
        imageUrls.push(data);
      });
    }

    // Save receipt with 'queued' status
    const [savedReceipt] = await db
      .insert(receipts)
      .values({
        ledgerId,
        text: validated.text || null,
        imageUrls: imageUrls,
        status: "queued",
      })
      .returning();

    // Trigger background processing (Fire and Forget)
    processReceiptQueue().catch((err) => {
      console.error("Background processing failed to start:", err);
    });

    return NextResponse.json({
      receiptId: savedReceipt.id,
      status: "queued",
      message: "Receipt queued for processing",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to queue receipt:", error);
    return NextResponse.json(
      { error: "Failed to queue receipt" },
      { status: 500 }
    );
  }
}

// PATCH /api/ledgers/[id]/receipts - 确认消息 (将 proposed 转换为 actual transactions)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const body = await request.json();
    const { receiptId, action } = body;

    if (!receiptId || action !== 'confirm') {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const receipt = await db.query.receipts.findFirst({
      where: and(
        eq(receipts.id, receiptId),
        eq(receipts.ledgerId, ledgerId)
      )
    });

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (receipt.status !== 'to_confirm') {
      return NextResponse.json({ error: "Receipt is not pending confirmation" }, { status: 400 });
    }

    // Convert proposed transactions to actual transactions
    type ProposedTransaction = {
      amount: number;
      currency: string | null;
      itemName: string;
      category?: string;
      notes?: string;
      transactionDate?: string;
    };
    const proposed = receipt.proposedTransactions as ProposedTransaction[];

    if (proposed && proposed.length > 0) {
      const allCategories = await db.query.categories.findMany({
        where: eq(categories.ledgerId, ledgerId)
      });

      for (const tx of proposed) {
        const categoryId = tx.category
          ? allCategories.find(c => c.name === tx.category)?.id ?? null
          : null;

        await db.insert(transactions).values({
          ledgerId: receipt.ledgerId,
          categoryId,
          receiptId: receipt.id,
          amount: tx.amount.toString(),
          currency: tx.currency,
          itemName: tx.itemName || "未分类",
          description: tx.notes || null,
          transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(),
        });
      }
    }

    // Mark receipt as completed
    await db.update(receipts)
      .set({
        status: 'completed',
        proposedTransactions: null // Optional: clear proposed to save space, or keep for history
      })
      .where(eq(receipts.id, receiptId));

    return NextResponse.json({ status: "success" });

  } catch (error) {
    console.error("Failed to confirm receipt:", error);
    return NextResponse.json(
      { error: "Failed to confirm receipt" },
      { status: 500 }
    );
  }
}
