"use server";

import { db } from "@/lib/db";
import { ledgerEntries, ledgers } from "@/lib/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { withLedgerAccess } from "@/lib/auth-actions";
import { NotFoundError } from "@/lib/errors";

// CSV column headers
const CSV_HEADERS = [
  "date",
  "itemName",
  "amount",
  "currency",
  "category",
  "description",
  "convertedAmount",
  "exchangeRate",
  "sourceDocument",
  "createdAt",
];

// Escape CSV field value
function escapeCsvField(value: string): string {
  // If field contains comma, newline, or quote, wrap in quotes and escape quotes
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const exportLedgerEntriesAction = withLedgerAccess(async (ledgerId: string) => {
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
      isEmpty: true as const,
    };
  }

  // Build CSV content manually
  const lines: string[] = [];

  // Header row
  lines.push(CSV_HEADERS.join(","));

  // Data rows
  for (const entry of entries) {
    const row = [
      entry.sourceDocument?.entryDate || "",
      entry.itemName,
      entry.amount,
      entry.currency || "",
      entry.category?.name || "",
      entry.description || "",
      entry.convertedAmount || "",
      entry.exchangeRate || "",
      entry.sourceDocument?.title || "",
      entry.createdAt
        ? new Date(entry.createdAt).toISOString().replace("T", " ").slice(0, 19)
        : "",
    ];
    lines.push(row.map(escapeCsvField).join(","));
  }

  // Join with CRLF for Windows Excel compatibility
  const csv = lines.join("\r\n");

  // Add UTF-8 BOM for Excel Chinese support
  const csvWithBom = "\uFEFF" + csv;

  // Generate filename: {ledgerName}_{YYYY-MM-DD}.csv
  const today = new Date().toISOString().slice(0, 10);
  const sanitizedName = ledger.name.replace(/[\\/:*?"<>|]/g, "_");
  const filename = `${sanitizedName}_${today}.csv`;

  return {
    csvContent: csvWithBom,
    filename,
    isEmpty: false as const,
  };
});
