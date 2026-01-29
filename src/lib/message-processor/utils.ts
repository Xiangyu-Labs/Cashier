import { z } from "zod";
import { ParsedLedgerEntry } from "./types";
import { getOpenAIClient } from "../ai/openai";
import { buildSummarizationPrompt } from "../ai/prompts";
import { logger } from "@/lib/logger";

const summarizationSchema = z.object({
    item_name: z.string(),
    notes: z.string().nullable().optional(),
});

/**
 * Groups and summarizes ledger entries using AI.
 */
export async function summarizeLedgerEntries(
    ledgerEntries: ParsedLedgerEntry[],
    targetLanguage: string = "zh-CN",
    originalText?: string
): Promise<ParsedLedgerEntry[]> {
    const finalEntries: ParsedLedgerEntry[] = [];
    const groups = new Map<string, ParsedLedgerEntry[]>();

    for (const entry of ledgerEntries) {
        if (!entry.entryDate || !entry.category) {
            finalEntries.push(entry);
            continue;
        }
        const key = `${entry.entryDate}|${entry.category}|${entry.currency}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(entry);
    }

    const client = getOpenAIClient();

    for (const [key, group] of groups.entries()) {
        if (group.length <= 1) {
            finalEntries.push(...group);
            continue;
        }

        const itemsToSummarize = group.map(entry => ({
            itemName: entry.itemName,
            amount: entry.amount,
            notes: entry.notes
        }));

        const prompt = buildSummarizationPrompt(itemsToSummarize, targetLanguage, originalText);

        try {
            const response = await client.generateContent(prompt, []);
            const cleaned = response.replace(/^```(?:json)?|```$/g, "").trim();
            const parsed = JSON.parse(cleaned);
            const { item_name, notes } = summarizationSchema.parse(parsed);

            const totalAmount = group.reduce((sum, entry) => sum + entry.amount, 0);
            const representative = group[0];

            finalEntries.push({
                itemName: item_name,
                amount: totalAmount,
                currency: representative.currency,
                category: representative.category,
                entryDate: representative.entryDate,
                notes: notes || null
            });
        } catch (error) {
            logger.error({ error, key }, "Failed to summarize group");
            finalEntries.push(...group);
        }
    }

    return finalEntries;
}
