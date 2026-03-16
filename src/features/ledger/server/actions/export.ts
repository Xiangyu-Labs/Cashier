"use server";

import { db } from "@/lib/db";
import { ledgerEntries, ledgers } from "@/lib/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { withLedgerAccess } from "@/lib/auth-actions";
import { NotFoundError } from "@/lib/errors";

// Export result type
export interface ExportResult {
  csvContent: string;
  filename: string;
  isEmpty: boolean;
}

// CSV column headers by locale
const CSV_HEADERS: Record<string, string[]> = {
  en: [
    "Date",
    "Item Name",
    "Amount",
    "Currency",
    "Category",
    "Description",
    "Converted Amount",
    "Exchange Rate",
    "Source Document",
    "Created At",
  ],
  zh: [
    "日期",
    "项目名称",
    "金额",
    "币种",
    "分类",
    "描述",
    "转换金额",
    "汇率",
    "来源文档",
    "创建时间",
  ],
};

// Escape CSV field value
function escapeCsvField(value: string): string {
  // If field contains comma, newline, or quote, wrap in quotes and escape quotes
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Format date to yyyy-MM-dd for consistency
function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Format datetime to yyyy-MM-dd HH:mm:ss
function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export const exportLedgerEntriesAction = withLedgerAccess(
  async (ledgerId: string, locale: string = "en"): Promise<ExportResult> => {
    // Get ledger info for filename
    const ledger = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });

    if (!ledger) {
      throw new NotFoundError("Ledger not found");
    }

    // Get all entries with category info
    const entries = await db.query.ledgerEntries.findMany({
      where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
      orderBy: [asc(ledgerEntries.createdAt)],
      with: {
        category: true,
        sourceDocument: true,
      },
    });

    if (entries.length === 0) {
      return {
        csvContent: "",
        filename: "",
        isEmpty: true,
      };
    }

    // Build CSV content manually
    const lines: string[] = [];

    // Header row (localized)
    const headers = CSV_HEADERS[locale] || CSV_HEADERS.en;
    lines.push(headers.join(","));

    // Data rows
    for (const entry of entries) {
      const row = [
        // Use entryDate from sourceDocument if available, otherwise format createdAt
        entry.sourceDocument?.entryDate || formatDate(entry.createdAt),
        entry.itemName ?? "",
        entry.amount ?? "",
        entry.currency ?? "",
        entry.category?.name ?? "",
        entry.description ?? "",
        entry.convertedAmount ?? "",
        entry.exchangeRate ?? "",
        entry.sourceDocument?.title ?? "",
        formatDateTime(entry.createdAt),
      ];
      lines.push(row.map(escapeCsvField).join(","));
    }

    // Join with CRLF for Windows Excel compatibility
    const csv = lines.join("\r\n");

    // Add UTF-8 BOM for Excel Chinese support
    const csvWithBom = "\uFEFF" + csv;

    // Generate filename: export_{YYYY-MM-DD}.csv
    const today = new Date().toISOString().slice(0, 10);
    const filename = `export_${today}.csv`;

    return {
      csvContent: csvWithBom,
      filename,
      isEmpty: false,
    };
  }
);
