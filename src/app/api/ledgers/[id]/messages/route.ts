import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, inputMessages, ledgers } from "@/lib/db/schema";
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

    if (!validated.text && !validated.images?.length) {
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

    const sourceType = determineSourceType(validated as MessageInput);
    const content = getMessageContent(sourceType, validated);

    // Save input message with 'queued' status
    const [savedMessage] = await db
      .insert(inputMessages)
      .values({
        ledgerId,
        contentType: sourceType === "mixed" ? "text" : sourceType,
        content,
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

function getMessageContent(sourceType: string, validated: z.infer<typeof messageSchema>): string {
  const normalizeImage = (data: string) => {
    if (data.startsWith("data:") || data.startsWith("http")) return data;
    return `data:image/jpeg;base64,${data}`;
  };

  if (sourceType === "image" && validated.images && validated.images.length > 0) {
    if (validated.images.length === 1) {
      return normalizeImage(validated.images[0].data);
    }
    return JSON.stringify(validated.images.map((img) => normalizeImage(img.data)));
  }

  if (sourceType === "text" && validated.text) {
    return validated.text;
  }

  // Deep normalization for mixed content json structure
  const copy = JSON.parse(JSON.stringify(validated));
  if (copy.images) {
    copy.images.forEach((img: { data: string; mimeType: string }) => {
      if (img.data) img.data = normalizeImage(img.data);
    });
  }
  return JSON.stringify(copy);
}
