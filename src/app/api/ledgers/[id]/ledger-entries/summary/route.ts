import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/ledger-entries/summary - 按分类汇总 + 趋势
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    // 构建过滤条件
    const conditions = [
      eq(ledgerEntries.ledgerId, ledgerId),
    ];

    // Use transactionDate if available, otherwise fallback to createdAt
    const dateCol = sql<string>`COALESCE(${ledgerEntries.transactionDate}, ${ledgerEntries.createdAt}::date)`;

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
        categoryId: ledgerEntries.categoryId,
        categoryName: entryCategories.name,
        categoryIcon: entryCategories.icon,
        currency: ledgerEntries.currency,
        total: sql<string>`sum(${ledgerEntries.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(ledgerEntries)
      .leftJoin(entryCategories, eq(ledgerEntries.categoryId, entryCategories.id))
      .where(whereClause)
      .groupBy(
        ledgerEntries.categoryId,
        entryCategories.name,
        entryCategories.icon,
        ledgerEntries.currency
      )
      .orderBy(sql`sum(${ledgerEntries.amount}) DESC`);

    // 计算总金额（按货币分组）
    const totals = await db
      .select({
        currency: ledgerEntries.currency,
        total: sql<string>`sum(${ledgerEntries.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(ledgerEntries)
      .where(whereClause)
      .groupBy(ledgerEntries.currency);

    // 计算趋势（按日期分组）
    const trend = await db
      .select({
        date: dateCol,
        total: sql<string>`sum(${ledgerEntries.amount})`,
      })
      .from(ledgerEntries)
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
    console.error("Failed to fetch ledger entry summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}
