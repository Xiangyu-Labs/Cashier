import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";

export interface ExportResult {
  csvContent: string;
  filename: string;
  isEmpty: boolean;
}

export interface ExportLedgerEntriesOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

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

const DEFAULT_EXPORT_LIMIT = Number.parseInt(process.env.EXPORT_MAX_ENTRIES ?? "2000", 10);

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(date: Date | string | number | null | undefined): string {
  if (date == null) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function formatDateTime(date: Date | string | number | null | undefined): string {
  if (date == null) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().replace("T", " ").slice(0, 19);
}

export async function exportLedgerEntries(
  ledgerId: string,
  locale = "en",
  options?: ExportLedgerEntriesOptions
): Promise<ExportResult> {
  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
  });

  if (ledger == null) {
    throw new NotFoundError("Ledger");
  }

  const conditions = [eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)];

  if (options?.startDate != null && options.startDate !== "") {
    conditions.push(gte(sourceDocuments.entryDate, options.startDate));
  }
  if (options?.endDate != null && options.endDate !== "") {
    conditions.push(lte(sourceDocuments.entryDate, options.endDate));
  }

  const entries = await db.query.ledgerEntries.findMany({
    where: and(...conditions),
    orderBy: [asc(ledgerEntries.createdAt)],
    limit: options?.limit ?? DEFAULT_EXPORT_LIMIT,
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

  const headers = CSV_HEADERS[locale] ?? CSV_HEADERS.en;
  if (headers == null) {
    throw new Error("Missing CSV headers");
  }

  const lines = [headers.join(",")];

  for (const entry of entries) {
    const row = [
      entry.sourceDocument?.entryDate ?? formatDate(entry.createdAt),
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

  const csv = lines.join("\r\n");
  const csvWithBom = "\uFEFF" + csv;
  const filename = `export_${new Date().toISOString().slice(0, 10)}.csv`;

  return {
    csvContent: csvWithBom,
    filename,
    isEmpty: false,
  };
}
