import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, inputMessages, categories, ledgers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getMessageProcessor } from "@/lib/message-processor/processor";
import { MessageInput, determineSourceType } from "@/lib/message-processor/types";

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

    // 获取账本的分类
    const ledgerCategories = await db.query.categories.findMany({
      where: eq(categories.ledgerId, ledgerId),
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

    const [savedMessage] = await db
      .insert(inputMessages)
      .values({
        ledgerId,
        contentType: sourceType === "mixed" ? "text" : sourceType,
        content,
      })
      .returning();

    // 调用 AI 处理
    const processor = getMessageProcessor();
    const result = await processor.process(validated as MessageInput, {
      ledgerId,
      language: ledger.language,
      categories: ledgerCategories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
      })),
    });

    // 更新 AI 响应
    await db
      .update(inputMessages)
      .set({ aiResponse: result.rawResponse })
      .where(eq(inputMessages.id, savedMessage.id));

    // 创建待确认的交易记录
    const createdTransactions = [];

    // 1. Filter out zero/negative amounts
    const validTransactions = result.transactions.filter((tx) => tx.amount > 0);

    // 2. Group by category
    const groupedTransactions = new Map<string | null, typeof validTransactions>();

    for (const tx of validTransactions) {
      const key = tx.category || null;
      if (!groupedTransactions.has(key)) {
        groupedTransactions.set(key, []);
      }
      groupedTransactions.get(key)!.push(tx);
    }

    // 3. Process each group
    for (const [categoryName, items] of groupedTransactions) {
      // Calculate total amount
      const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

      // Match category ID
      let categoryId: string | null = null;
      let itemName = "未分类";

      if (categoryName) {
        itemName = categoryName;
        const matchedCategory = ledgerCategories.find(
          (c) => c.name === categoryName
        );
        if (matchedCategory) {
          categoryId = matchedCategory.id;
        }
      }

      // Use the first item's currency and date
      const currency = items[0].currency;
      const transactionDate = items[0].transactionDate;

      // Construct metadata with original items
      const metadata = {
        originalItems: items.map((item) => ({
          itemName: item.itemName,
          amount: item.amount,
          ...item.metadata,
        })),
      };

      const [created] = await db
        .insert(transactions)
        .values({
          ledgerId,
          categoryId,
          inputMessageId: savedMessage.id,
          amount: totalAmount.toString(),
          currency,
          itemName,
          status: "pending",
          sourceType,
          transactionDate: transactionDate ? new Date(transactionDate) : null,
          metadata,
        })
        .returning();

      createdTransactions.push({
        ...created,
        category: categoryId
          ? ledgerCategories.find((c) => c.id === categoryId)
          : null,
      });
    }

    return NextResponse.json({
      messageId: savedMessage.id,
      transactions: createdTransactions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to process message:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
