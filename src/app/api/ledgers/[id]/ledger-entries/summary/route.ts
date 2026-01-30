import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { ExchangeRateService } from "@/lib/currency/exchange-rate-service";
import { requireLedgerAccess } from "@/lib/auth/helpers";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/ledger-entries/summary - 按分类汇总 + 趋势
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const mainCurrency = searchParams.get("mainCurrency");

    // 构建过滤条件
    const conditions = [
      eq(ledgerEntries.ledgerId, ledgerId),
    ];



    // Use entryDate if available, otherwise fallback to createdAt
    const dateCol = sql<string>`COALESCE(${ledgerEntries.entryDate}, ${ledgerEntries.createdAt}::date)`;

    if (startDate) {
      conditions.push(sql`${dateCol} >= ${startDate}::date`);
    }
    if (endDate) {
      conditions.push(sql`${dateCol} <= ${endDate}::date`);
    }

    const whereClause = and(...conditions);

    // 1. 获取基础汇总 (不带转换，用于备选返回或 multi-currency 基础视图)
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

    const totalsData = await db
      .select({
        currency: ledgerEntries.currency,
        total: sql<string>`sum(${ledgerEntries.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(ledgerEntries)
      .where(whereClause)
      .groupBy(ledgerEntries.currency);

    const trendData = await db
      .select({
        date: dateCol,
        total: sql<string>`sum(${ledgerEntries.amount})`,
      })
      .from(ledgerEntries)
      .where(whereClause)
      .groupBy(dateCol)
      .orderBy(dateCol);

    // 2. 如果请求了 mainCurrency，进行汇率换算并重新聚合
    if (mainCurrency) {
      const detailedTotals = await db
        .select({
          categoryId: ledgerEntries.categoryId,
          categoryName: entryCategories.name,
          categoryIcon: entryCategories.icon,
          currency: ledgerEntries.currency,
          date: dateCol,
          total: sql<string>`sum(${ledgerEntries.amount})`,
          count: sql<number>`count(*)::int`,
        })
        .from(ledgerEntries)
        .leftJoin(entryCategories, eq(ledgerEntries.categoryId, entryCategories.id))
        .where(whereClause)
        .groupBy(ledgerEntries.categoryId, entryCategories.name, entryCategories.icon, ledgerEntries.currency, dateCol);

      const currencyConversions: Record<string, { originalTotal: number, convertedTotal: number, count: number }> = {};
      const categoryConversions: Record<string, { categoryId: string | null, categoryName: string, categoryIcon: string | null, convertedTotal: number, count: number }> = {};
      const trendConversions: Record<string, number> = {};
      let absoluteTotal = 0;

      for (const group of detailedTotals) {
        const amount = parseFloat(group.total || "0");
        const currency = group.currency || "unknown";

        let converted = amount;
        if (currency !== "unknown" && currency !== mainCurrency) {
          try {
            converted = await ExchangeRateService.convert(amount, currency, mainCurrency, group.date);
          } catch (e) {
            console.warn(`Failed to convert ${currency} to ${mainCurrency} on ${group.date}`, e);
          }
        }

        // 按货币聚合
        if (!currencyConversions[currency]) {
          currencyConversions[currency] = { originalTotal: 0, convertedTotal: 0, count: 0 };
        }
        currencyConversions[currency].originalTotal += amount;
        currencyConversions[currency].convertedTotal += converted;
        currencyConversions[currency].count += group.count;

        // 按分类聚合
        const catId = group.categoryId || "null";
        if (!categoryConversions[catId]) {
          categoryConversions[catId] = {
            categoryId: group.categoryId,
            categoryName: group.categoryName || "未分类",
            categoryIcon: group.categoryIcon,
            convertedTotal: 0,
            count: 0
          };
        }
        categoryConversions[catId].convertedTotal += converted;
        categoryConversions[catId].count += group.count;

        // 按趋势聚合
        trendConversions[group.date] = (trendConversions[group.date] || 0) + converted;

        absoluteTotal += converted;
      }

      const convertedTotal = {
        currency: mainCurrency,
        total: absoluteTotal,
        conversions: Object.entries(currencyConversions).map(([curr, data]) => ({
          fromCurrency: curr === "unknown" ? null : curr,
          originalTotal: data.originalTotal,
          convertedTotal: data.convertedTotal,
          count: data.count,
        }))
      };

      const finalByCategory = Object.values(categoryConversions)
        .map(cat => ({
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          categoryIcon: cat.categoryIcon,
          currency: mainCurrency,
          total: cat.convertedTotal,
          count: cat.count
        }))
        .sort((a, b) => b.total - a.total);

      const finalTrend = Object.entries(trendConversions)
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json({
        byCategory: finalByCategory,
        totals: totalsData.map((t) => ({
          currency: t.currency,
          total: parseFloat(t.total || "0"),
          count: t.count,
        })),
        trend: finalTrend,
        convertedTotal
      });
    }

    // 默认返回 (无转换)
    return NextResponse.json({
      byCategory: summary.map((s) => ({
        categoryId: s.categoryId,
        categoryName: s.categoryName || "未分类",
        categoryIcon: s.categoryIcon,
        currency: s.currency,
        total: parseFloat(s.total || "0"),
        count: s.count,
      })),
      totals: totalsData.map((t) => ({
        currency: t.currency,
        total: parseFloat(t.total || "0"),
        count: t.count,
      })),
      trend: trendData.map((t) => ({
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
