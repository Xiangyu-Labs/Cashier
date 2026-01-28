// Parse Receipt Task
// Handles parsing receipt images/text into transactions via GPT

import { registerTask, TaskHandler, GptTask, TaskExecutionContext } from "@/lib/gpt";
import { db } from "@/lib/db";
import { receipts, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getMessageProcessor } from "@/lib/message-processor/processor";
import { CategoryInfo, ParsedTransaction } from "@/lib/message-processor/types";
import { buildSummarizationPrompt } from "@/lib/ai/prompts";
import { getOpenAIClient } from "@/lib/ai/openai";
import { z } from "zod";

// Task type constant
export const TASK_TYPE_PARSE_RECEIPT = "parse_receipt";

export interface ParseReceiptInput {
    receiptId: string;
    text?: string;
    imageUrls?: string[];
    categories: CategoryInfo[];
    settings: {
        mergeSimilarItems: boolean;
        autoRecognizeDate: boolean;
        autoConfirm: boolean;
    };
}

const summarizationSchema = z.object({
    item_name: z.string(),
    notes: z.string().nullable().optional(),
});

interface ParseReceiptOutput {
    transactions: ParsedTransaction[];
    title?: string;
}

/**
 * Parse Receipt Task Handler
 */
const parseReceiptHandler: TaskHandler<ParseReceiptOutput> = {
    async execute(task: GptTask, context: TaskExecutionContext): Promise<ParseReceiptOutput> {
        const input = task.input as ParseReceiptInput;

        // Step 1: Parse with GPT
        await context.updateProgress({
            currentStep: "parse",
            completedSteps: [],
            totalSteps: input.settings.mergeSimilarItems ? 2 : 1,
        });

        const processor = getMessageProcessor();
        const result = await processor.process(
            {
                text: input.text,
                images: input.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }))
            },
            {
                categories: input.categories,
                mergeSimilarItems: false // Handle merge in step 2
            }
        );

        // Apply date override if autoRecognizeDate is disabled
        let transactions = result.transactions;
        if (!input.settings.autoRecognizeDate) {
            transactions = transactions.map(tx => ({
                ...tx,
                transactionDate: new Date().toISOString().split("T")[0],
            }));
        }

        // Check if valid
        if (result.isValid === false) {
            return { transactions: [] };
        }

        // Step 2: Merge similar items (optional)
        if (input.settings.mergeSimilarItems && transactions.length > 1) {
            await context.updateProgress({
                currentStep: "merge",
                completedSteps: ["parse"],
                totalSteps: 2,
                data: { parseResult: transactions },
            });

            transactions = await summarizeTransactions(transactions, input.text);
        }

        return {
            transactions,
            title: result.title
        };
    },

    async onComplete(output: ParseReceiptOutput, task: GptTask): Promise<void> {
        const input = task.input as ParseReceiptInput;
        const { transactions: parsedTransactions, title } = output;
        const validTransactions = parsedTransactions.filter(tx => tx.amount > 0);

        if (input.settings.autoConfirm && validTransactions.length > 0 && task.ledgerId) {
            // Direct insertion of transactions
            for (const tx of validTransactions) {
                const categoryId = tx.category
                    ? input.categories.find((c) => c.name === tx.category)?.id ?? null
                    : null;

                await db.insert(transactions).values({
                    ledgerId: task.ledgerId,
                    categoryId,
                    receiptId: input.receiptId,
                    amount: tx.amount.toString(),
                    currency: tx.currency,
                    itemName: tx.itemName || "未分类",
                    description: tx.notes || null,
                    transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(),
                });
            }

            // Mark receipt as completed
            await db.update(receipts).set({
                status: "completed",
                proposedTransactions: validTransactions,
                title: title || null,
            }).where(eq(receipts.id, input.receiptId));
        } else {
            // Update receipt with proposed transactions and title for manual confirmation
            await db.update(receipts).set({
                status: validTransactions.length > 0 ? "to_confirm" : "completed",
                proposedTransactions: validTransactions,
                title: title || null,
            }).where(eq(receipts.id, input.receiptId));
        }
    },

    async onError(error: Error, task: GptTask): Promise<void> {
        const input = task.input as ParseReceiptInput;

        // Update receipt status to failed
        await db.update(receipts).set({
            status: "failed",
            error: error.message,
        }).where(eq(receipts.id, input.receiptId));
    },
};

// Helper: Summarize transactions by category and date
async function summarizeTransactions(
    transactions: ParsedTransaction[],
    originalText?: string
): Promise<ParsedTransaction[]> {
    const finalTransactions: ParsedTransaction[] = [];
    const groups: { [key: string]: ParsedTransaction[] } = {};

    // Group by category and date
    for (const t of transactions) {
        if (!t.transactionDate || !t.category) {
            finalTransactions.push(t);
            continue;
        }
        const key = `${t.transactionDate}|${t.category}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(t);
    }

    const client = getOpenAIClient();

    for (const key in groups) {
        const group = groups[key];
        if (group.length <= 1) {
            finalTransactions.push(...group);
            continue;
        }

        const itemsToSummarize = group.map(t => ({
            itemName: t.itemName,
            amount: t.amount,
            notes: t.notes
        }));

        const prompt = buildSummarizationPrompt(itemsToSummarize, originalText);

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
            console.error("Failed to summarize group:", error);
            finalTransactions.push(...group);
        }
    }

    return finalTransactions;
}

// Register the task handler
registerTask(TASK_TYPE_PARSE_RECEIPT, parseReceiptHandler);

export { parseReceiptHandler };
