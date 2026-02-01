import { z } from "zod";
import { ParsedLedgerEntry } from "../types";
import { getOpenAIClient } from "../services/openai";
import { buildSummarizationPrompt } from "../services/prompts";
import { logger } from "@/lib/logger";

const summarizationSchema = z.object({
    item_name: z.string(),
    notes: z.string().nullable().optional(),
});

/**
 * Process a single group of ledger entries for summarization.
 * Returns either a summarized single entry or the original entries on failure.
 */
async function processGroupForSummarization(
    key: string,
    group: ParsedLedgerEntry[],
    targetLanguage: string,
    originalText?: string
): Promise<ParsedLedgerEntry[]> {
    // Single item groups don't need summarization
    if (group.length <= 1) {
        return group;
    }

    const client = getOpenAIClient();
    const itemsToSummarize = group.map(entry => ({
        itemName: entry.itemName,
        amount: entry.amount,
        notes: entry.notes
    }));

    const prompt = buildSummarizationPrompt(itemsToSummarize, targetLanguage, originalText);

    try {
        const response = await client.generateContent(prompt, []);

        // Defensive parsing: clean markdown code blocks
        const cleaned = response.content.replace(/^```(?:json)?|```$/g, "").trim();

        // Defensive parsing: try-catch around JSON
        let parsed: unknown;
        try {
            parsed = JSON.parse(cleaned);
        } catch (jsonError) {
            logger.error({ jsonError, key, response: cleaned }, "Failed to parse AI response as JSON");
            return group; // Fall back to original entries
        }

        // Schema validation with Zod
        const validationResult = summarizationSchema.safeParse(parsed);
        if (!validationResult.success) {
            logger.error({ error: validationResult.error, key, parsed }, "AI response failed schema validation");
            return group; // Fall back to original entries
        }

        const { item_name, notes } = validationResult.data;
        const totalAmount = group.reduce((sum, entry) => sum + entry.amount, 0);
        const representative = group[0];

        return [{
            itemName: item_name,
            amount: totalAmount,
            currency: representative.currency,
            category: representative.category,
            entryDate: representative.entryDate,
            notes: notes || null
        }];
    } catch (error) {
        // Catch-all for any unexpected errors (network, API, etc.)
        logger.error({ error, key }, "Failed to summarize group");
        return group; // Fall back to original entries
    }
}

/**
 * Groups and summarizes ledger entries using AI.
 * Processes all groups in parallel for better performance.
 */
export async function summarizeLedgerEntries(
    ledgerEntries: ParsedLedgerEntry[],
    targetLanguage: string = "zh-CN",
    originalText?: string
): Promise<ParsedLedgerEntry[]> {
    const entriesWithoutGrouping: ParsedLedgerEntry[] = [];
    const groups = new Map<string, ParsedLedgerEntry[]>();

    // Group entries by date|category|currency
    for (const entry of ledgerEntries) {
        if (!entry.entryDate || !entry.category) {
            entriesWithoutGrouping.push(entry);
            continue;
        }
        const key = `${entry.entryDate}|${entry.category}|${entry.currency}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(entry);
    }

    // Process all groups in parallel
    const groupPromises = Array.from(groups.entries()).map(
        ([key, group]) => processGroupForSummarization(key, group, targetLanguage, originalText)
    );

    const results = await Promise.allSettled(groupPromises);

    // Collect results, handling any unexpected rejections
    const processedEntries: ParsedLedgerEntry[] = [];
    const groupsArray = Array.from(groups.values());

    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "fulfilled") {
            processedEntries.push(...result.value);
        } else {
            // This should rarely happen since processGroupForSummarization handles errors internally
            // But as a defensive measure, fall back to original entries
            logger.error({ error: result.reason, groupIndex: i }, "Unexpected rejection in group processing");
            processedEntries.push(...groupsArray[i]);
        }
    }

    return [...entriesWithoutGrouping, ...processedEntries];
}
