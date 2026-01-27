import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/transactions/summary - 按分类汇总 + 趋势
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "confirmed";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 构建过滤条件
    const conditions = [
      eq(transactions.ledgerId, ledgerId),
      eq(transactions.status, status as "pending" | "confirmed"),
    ];

    // Use transactionDate if available, otherwise fallback to createdAt
    const dateCol = sql<string>`COALESCE(${transactions.transactionDate}, ${transactions.createdAt}::date)`;

    if (startDate) {
      conditions.push(sql`${dateCol} >= ${startDate}::date`);
    }
    if (endDate) {
      conditions.push(sql`${dateCol} <= ${endDate}::date`);
    }

    const whereClause = and(...conditions);

    // 获取按分类汇总的数据
    const summary = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        currency: transactions.currency,
        total: sql<string>`sum(${transactions.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(whereClause)
      .groupBy(
        transactions.categoryId,
        categories.name,
        categories.icon,
        transactions.currency
      )
      .orderBy(sql`sum(${transactions.amount}) DESC`);

    // 计算总金额（按货币分组）
    const totals = await db
      .select({
        currency: transactions.currency,
        total: sql<string>`sum(${transactions.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(whereClause)
      .groupBy(transactions.currency);

    // 计算趋势（按日期分组）
    const trend = await db
      .select({
        date: dateCol,
        total: sql<string>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .where(whereClause)
      .groupBy(dateCol)
      .orderBy(dateCol);

    return NextResponse.json({
      byCategory: summary.map((s) => ({
        categoryId: s.categoryId,
        categoryName: s.categoryName || "未分类",
        categoryIcon: s.categoryIcon,
        currency: s.currency,
        total: parseFloat(s.total || "0"),
        count: s.count,
      })),
      totals: totals.map((t) => ({
        currency: t.currency,
        total: parseFloat(t.total || "0"),
        count: t.count,
      })),
      trend: trend.map((t) => ({
        date: t.date,
        total: parseFloat(t.total || "0"),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}
