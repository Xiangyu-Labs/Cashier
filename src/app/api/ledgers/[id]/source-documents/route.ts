import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sourceDocuments, ledgers } from "@/lib/db/schema";
import { eq, inArray, and, desc, lte, gte } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

const sourceDocumentSchema = z.object({
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

// GET /api/ledgers/[id]/source-documents - 获取来源文档列表 (主要用于获取队列中的消息)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: ledgerId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status"); // e.g. "queued,processing"
  const limit = parseInt(searchParams.get("limit") || "20");
  const cursor = searchParams.get("cursor"); // createdAt timestamp

  const conditions = [eq(sourceDocuments.ledgerId, ledgerId)];

  if (status) {
    const statuses = status.split(",") as ("queued" | "processing" | "to_confirm" | "completed" | "error")[];
    conditions.push(inArray(sourceDocuments.status, statuses));
  }

  if (cursor) {
    conditions.push(lte(sourceDocuments.createdAt, new Date(cursor)));
  }

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (startDate) {
    conditions.push(gte(sourceDocuments.createdAt, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(sourceDocuments.createdAt, new Date(endDate)));
  }

  const result = await db.query.sourceDocuments.findMany({
    where: and(...conditions),
    orderBy: [desc(sourceDocuments.createdAt)],
    limit: limit + 1,
  });

  let nextCursor = null;
  if (result.length > limit) {
    const nextItem = result.pop();
    if (nextItem) {
      nextCursor = nextItem.createdAt.toISOString();
    }
  }

  return NextResponse.json({
    items: result,
    nextCursor,
  });
}

// POST /api/ledgers/[id]/source-documents - 处理多模态输入
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const body = await request.json();
    const validated = sourceDocumentSchema.parse(body);

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
          data = `data: image / jpeg; base64, ${data} `;
        }
        imageUrls.push(data);
      });
    }

    // Save source document with 'queued' status
    const [savedDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: validated.text || null,
        imageUrls: imageUrls,
        status: "queued",
      })
      .returning();

    // Create a flow task
    const { submitFlowTask } = await import("@/lib/flow/producer");
    const { TASK_TYPE_PARSE_SOURCE_DOCUMENT } = await import("@/lib/tasks/parse-source-document");

    await submitFlowTask({
      type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
      title: validated.text ? `解析: ${validated.text.slice(0, 20)}...` : "解析图片账单",
      ledgerId: ledgerId,
      data: {
        sourceDocumentId: savedDoc.id,
        text: validated.text,
        imageUrls: imageUrls,
        language: ledger.language,
        preferredCurrencies: ledger.currencies || undefined,
        categories: await db.query.entryCategories.findMany({
          where: (entryCategories, { eq, or, isNull }) => or(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.ledgerId))
        }),
        settings: {
          mergeSimilarItems: ledger.mergeSimilarItems,
          autoRecognizeDate: ledger.autoRecognizeDate,
          autoConfirm: ledger.autoConfirm,
          aiCustomPrompt: ledger.aiCustomPrompt,
        },
      },
    });

    return NextResponse.json({
      sourceDocumentId: savedDoc.id,
      status: "queued",
      message: "Source document queued for processing",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ error }, "Failed to queue source document");
    return NextResponse.json(
      { error: "Failed to queue source document" },
      { status: 500 }
    );
  }
}
