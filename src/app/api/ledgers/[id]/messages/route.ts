import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inputMessages, ledgers } from "@/lib/db/schema";
import { eq, inArray, and, asc } from "drizzle-orm";
import { z } from "zod";

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
    // Validate or cast to allowed status values
    const statuses = status.split(",") as ("queued" | "processing" | "completed" | "failed")[];
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

    // Save input message with 'queued' status
    const [savedMessage] = await db
      .insert(inputMessages)
      .values({
        ledgerId,
        text: validated.text || null,
        imageUrls: imageUrls,
        status: "queued",
      })
      .returning();

    // Trigger background processing (Fire and Forget)
    processMessageQueue().catch((err) => {
      console.error("Background processing failed to start:", err);
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

