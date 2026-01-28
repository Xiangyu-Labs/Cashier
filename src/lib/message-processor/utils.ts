import { z } from "zod";
import { ParsedTransaction } from "./types";
import { getOpenAIClient } from "../ai/openai";
import { buildSummarizationPrompt } from "../ai/prompts";
import { logger } from "@/lib/logger";

const summarizationSchema = z.object({
    item_name: z.string(),
    notes: z.string().nullable().optional(),
});

/**
 * Groups and summarizes transactions using AI.
 */
export async function summarizeTransactions(
    transactions: ParsedTransaction[],
    targetLanguage: string = "zh-CN",
    originalText?: string
): Promise<ParsedTransaction[]> {
    const finalTransactions: ParsedTransaction[] = [];
    const groups = new Map<string, ParsedTransaction[]>();

    for (const t of transactions) {
        if (!t.transactionDate || !t.category) {
            finalTransactions.push(t);
            continue;
        }
        const key = `${t.transactionDate}|${t.category}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(t);
    }

    const client = getOpenAIClient();

    for (const [key, group] of groups.entries()) {
        if (group.length <= 1) {
            finalTransactions.push(...group);
            continue;
        }

        const itemsToSummarize = group.map(t => ({
            itemName: t.itemName,
            amount: t.amount,
            notes: t.notes
        }));

        const prompt = buildSummarizationPrompt(itemsToSummarize, targetLanguage, originalText);

        try {
            const response = await client.generateContent(prompt, []);
            const cleaned = response.replace(/^```(?:json)?|```$/g, "").trim();
            const parsed = JSON.parse(cleaned);
            const { item_name, notes } = summarizationSchema.parse(parsed);

            const totalAmount = group.reduce((sum, t) => sum + t.amount, 0);
            const representative = group[0];

            finalTransactions.push({
                itemName: item_name,
                amount: totalAmount,
                currency: representative.currency,
                category: representative.category,
                transactionDate: representative.transactionDate,
                notes: notes || null
            });
        } catch (error) {
            logger.error({ error, key }, "Failed to summarize group");
            finalTransactions.push(...group);
        }
    }

    return finalTransactions;
}
