"use server";

import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { COMMON_LUCIDE_ICONS } from "@/config/icons";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { db } from "@/lib/db";
import { runtimeEnv } from "@/lib/env/runtime";
import { NotFoundError } from "@/lib/errors";
import { extractJson } from "@/lib/tasks/json-utils";
import { entryCategories, ledgers } from "@/persistence";
import { parseEntryCategoryId } from "../contract-schemas";
import { withLedgerAccess } from "../access";

const metadataSchema = z.object({
  icon: z.enum(COMMON_LUCIDE_ICONS as [string, ...string[]]),
  description: z.string().trim().min(1).max(120),
});

export interface CategoryMetadataResult {
  categoryId: string;
  icon: string;
  description: string;
  wroteIcon: boolean;
  wroteDescription: boolean;
}

export const generateEntryCategoryMetadataAction = withLedgerAccess(
  async (ledgerId: string, inputCategoryId: string): Promise<CategoryMetadataResult> => {
    const categoryId = parseEntryCategoryId(inputCategoryId);
    const [category, ledger, existing] = await Promise.all([
      db.query.entryCategories.findFirst({
        where: and(eq(entryCategories.id, categoryId), eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)),
      }),
      db.query.ledgers.findFirst({ where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)) }),
      db.query.entryCategories.findMany({
        where: and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)),
        columns: { name: true },
      }),
    ]);
    if (category == null || ledger == null) throw new NotFoundError("Category");

    const language = ledger.metadata?.settings?.aiLanguage ?? "zh-CN";
    const result = await getOpenAIClient().generateContent(
      "Generate bookkeeping category metadata. Return JSON only. The icon must be selected from the provided Lucide icon names. Keep the description short and concrete in the requested language.",
      [{
        role: "user",
        content: JSON.stringify({
          category: category.name,
          existingCategories: existing.map((item) => item.name),
          language,
          allowedIcons: COMMON_LUCIDE_ICONS,
          output: { icon: "Lucide icon name", description: "maximum 120 characters" },
        }),
      }],
      runtimeEnv.aiModel,
      180,
      0.2
    );
    const metadata = metadataSchema.parse(JSON.parse(extractJson(result.content)));
    const now = new Date();
    const [iconRows, descriptionRows] = await db.transaction(async (tx) => Promise.all([
      tx.update(entryCategories)
        .set({ icon: metadata.icon, updatedAt: now })
        .where(and(eq(entryCategories.id, categoryId), eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt), or(isNull(entryCategories.icon), eq(entryCategories.icon, ""))))
        .returning({ id: entryCategories.id }),
      tx.update(entryCategories)
        .set({ description: metadata.description, updatedAt: now })
        .where(and(eq(entryCategories.id, categoryId), eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt), or(isNull(entryCategories.description), eq(entryCategories.description, ""))))
        .returning({ id: entryCategories.id }),
    ]));
    return {
      categoryId,
      icon: metadata.icon,
      description: metadata.description,
      wroteIcon: iconRows.length > 0,
      wroteDescription: descriptionRows.length > 0,
    };
  }
);
