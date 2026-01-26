import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, inputMessages, categories, ledgers } from "@/lib/db/schema";
import { eq, inArray, and, asc } from "drizzle-orm";
import { z } from "zod";
import { getMessageProcessor } from "@/lib/message-processor/processor";
import { MessageInput, determineSourceType } from "@/lib/message-processor/types";
import { processMessageQueue } from "@/lib/queue";

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

// GET /api/ledgers/[id]/messages - 获取消息列表 (主要用于获取队列中的消息)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: ledgerId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status"); // e.g. "queued,processing"

  const conditions = [eq(inputMessages.ledgerId, ledgerId)];

  if (status) {
    const statuses = status.split(",") as any[];
    conditions.push(inArray(inputMessages.status, statuses));
  }

  const messages = await db.query.inputMessages.findMany({
    where: and(...conditions),
    orderBy: [asc(inputMessages.createdAt)],
  });

  return NextResponse.json(messages);
}

// POST /api/ledgers/[id]/messages - 处理多模态输入
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const body = await request.json();
    const validated = messageSchema.parse(body);

    // 验证至少有一种输入
    if (!validated.text && !validated.images?.length) {
      return NextResponse.json(
        { error: "At least one input (text or images) is required" },
        { status: 400 }
      );
    }

    // 获取账本信息
    const ledger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });

    if (!ledger) {
      return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    }

    // 获取全局分类
    const ledgerCategories = await db.query.categories.findMany({
      orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
    });

    // 保存原始输入
    const sourceType = determineSourceType(validated as MessageInput);

    // 根据内容类型提取可直接使用的内容
    let content: string;
    if (sourceType === "image" && validated.images && validated.images.length > 0) {
      if (validated.images.length === 1) {
        // 单张图片：直接存储 data URL
        content = validated.images[0].data;
      } else {
        // 多张图片：存储 data URL 数组的 JSON
        content = JSON.stringify(validated.images.map((img) => img.data));
      }
    } else if (sourceType === "text" && validated.text) {
      // 存储纯文本
      content = validated.text;
    } else {
      // mixed 或其他情况，存储完整 JSON 以保留所有数据
      content = JSON.stringify(validated);
    }

    // 4. Save input message with 'queued' status
    const [savedMessage] = await db
      .insert(inputMessages)
      .values({
        ledgerId,
        contentType: sourceType === "mixed" ? "text" : sourceType,
        content,
        status: "queued",
      })
      .returning();

    // 5. Trigger background processing (Fire and Forget)
    // In a serverless environment like Vercel, this might need waitUntil(promise)
    // But for standard Node.js/Next.js, this works as long as the process lives.
    processMessageQueue().catch((err) => {
      console.error("Background processing failed failed to start:", err);
    });

    return NextResponse.json({
      messageId: savedMessage.id,
      status: "queued",
      message: "Message queued for processing",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to queue message:", error);
    return NextResponse.json(
      { error: "Failed to queue message" },
      { status: 500 }
    );
  }
}
