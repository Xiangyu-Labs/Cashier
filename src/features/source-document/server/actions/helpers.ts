"use server";

import { db } from "@/lib/db";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";
import type { Ledger } from "@/lib/db/schema";

/**
 * Common logic to normalize images and prepare task data
 */
export async function prepareSourceDocumentTask(
    ledgerId: string,
    ledger: Ledger,
    text: string | undefined,
    images: { data: string; mimeType: string }[] | undefined,
    sourceDocumentId: string
): Promise<string[]> {
    const imageUrls: string[] = [];
    if (images) {
        images.forEach((img) => {
            let data = img.data;
            if (!data.startsWith("data:") && !data.startsWith("http")) {
                data = `data:image/jpeg;base64,${data}`;
            }
            imageUrls.push(data);
        });
    }

    const categories = await db.query.entryCategories.findMany({
        where: (table, { eq, or, isNull, and }) => and(
            or(eq(table.ledgerId, ledgerId), isNull(table.ledgerId)),
            isNull(table.deletedAt)
        ),
        orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.id)]
    });

    const settings = ledger.metadata?.settings || {};

    await flowEngine.submit(
        TASK_TYPE_PARSE_SOURCE_DOCUMENT,
        {
            ledgerId: ledgerId,
            sourceDocumentId: sourceDocumentId,
            text: text,
            imageUrls: imageUrls,
            aiLanguage: settings.aiLanguage || "zh-CN",
            preferredCurrencies: settings.currencies || undefined,
            categories: categories,
            settings: {
                aiCustomPrompt: settings.aiCustomPrompt,
            },
        },
        {
            title: "解析单据",
            scopeId: ledgerId,
            entityType: 'source_document',
            entityId: sourceDocumentId,
        }
    );

    return imageUrls;
}
