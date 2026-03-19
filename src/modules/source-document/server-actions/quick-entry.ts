"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/persistence";
import { requireLedgerAccess } from "@/modules/auth/helpers";
import { and, eq, isNull } from "drizzle-orm";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { CurrencyService } from "@/modules/currency/services";
import { SourceDocumentType } from "@/persistence/schema/source-document";
import { createQuickEntrySchema } from "./types";
import type { z } from "zod";
import { AppError, UnauthorizedError } from "@/lib/errors";

// ============ Helper Functions ============

/**
 * Fetch category name for entry title generation
 */
async function fetchCategoryName(categoryId: string | null): Promise<string> {
  if (categoryId == null || categoryId === "") return "";

  const category = await db.query.entryCategories.findFirst({
    where: and(eq(entryCategories.id, categoryId), isNull(entryCategories.deletedAt)),
  });

  return category?.name ?? "";
}

interface ConversionResult {
  convertedAmount: string | null;
  exchangeRate: string | null;
}

/**
 * Convert amount between currencies using CurrencyService
 */
async function convertEntryAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<ConversionResult> {
  const result = await CurrencyService.convertEntryAmount({
    amount,
    fromCurrency,
    toCurrency,
    date,
  });

  return result ?? { convertedAmount: null, exchangeRate: null };
}

interface QuickEntryData {
  categoryId: string | null;
  itemName: string | null;
  description: string | null;
  amount: number;
  entryDate: string;
}

/**
 * Atomically insert source document and ledger entry
 */
function atomicInsertSourceAndEntry(
  data: QuickEntryData,
  currency: string,
  categoryName: string,
  conversion: ConversionResult,
  ledgerId: string
): { sourceDocId: string; entryId: string } {
  const sourceDocId = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  const itemName = data.itemName ?? categoryName;

  db.transaction((tx) => {
    tx.insert(sourceDocuments)
      .values({
        id: sourceDocId,
        ledgerId,
        title: categoryName,
        text: null,
        imageUrls: [],
        status: "completed",
        type: SourceDocumentType.Manual,
        entryDate: data.entryDate,
      })
      .run();

    tx.insert(ledgerEntries)
      .values({
        id: entryId,
        ledgerId,
        sourceDocumentId: sourceDocId,
        categoryId: data.categoryId,
        amount: data.amount.toFixed(2),
        currency,
        itemName,
        description: data.description,
        convertedAmount: conversion.convertedAmount,
        exchangeRate: conversion.exchangeRate,
      })
      .run();
  });

  return { sourceDocId, entryId };
}

// ============ Main Action ============

/**
 * Create a quick entry (manual entry without AI parsing).
 * Atomically creates a SourceDocument (type="manual", status="completed") and a LedgerEntry.
 */
export async function createQuickEntryAction(
  ledgerId: string,
  data: z.infer<typeof createQuickEntrySchema>
) {
  let ledger: Awaited<ReturnType<typeof requireLedgerAccess>>["ledger"];
  try {
    ({ ledger } = await requireLedgerAccess(ledgerId));
  } catch (error) {
    if (error instanceof AppError) {
      throw new UnauthorizedError("Unauthorized or Ledger not found");
    }
    throw error;
  }

  const validated = createQuickEntrySchema.parse(data);
  const mainCurrency = ledger.metadata?.settings?.mainCurrency ?? "CNY";
  const entryCurrency = validated.currency ?? mainCurrency;
  const today = validated.entryDate ?? formatDateTimeForApi(new Date());

  // Gather all data needed for insertion
  const [categoryName, conversion] = await Promise.all([
    fetchCategoryName(validated.categoryId),
    convertEntryAmount(validated.amount, entryCurrency, mainCurrency, today),
  ]);

  // Atomic insert
  const { sourceDocId, entryId } = atomicInsertSourceAndEntry(
    {
      categoryId: validated.categoryId,
      itemName: validated.itemName ?? null,
      description: validated.description ?? null,
      amount: validated.amount,
      entryDate: today,
    },
    entryCurrency,
    categoryName,
    conversion,
    ledgerId
  );

  return {
    sourceDocumentId: sourceDocId,
    ledgerEntryId: entryId,
    status: "completed" as const,
  };
}
