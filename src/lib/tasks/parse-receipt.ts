// Parse Receipt Task
// Handles parsing receipt images/text into transactions via GPT

import { registerTask, TaskHandler, GptTask, TaskExecutionContext } from "@/lib/gpt";
import { db } from "@/lib/db";
import { receipts, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getMessageProcessor } from "@/lib/message-processor/processor";
import { CategoryInfo, ParsedTransaction } from "@/lib/message-processor/types";
import { summarizeTransactions } from "@/lib/message-processor/utils";

// Task type constant
export const TASK_TYPE_PARSE_RECEIPT = "parse_receipt";

export interface ParseReceiptInput {
    receiptId: string;
    text?: string;
    imageUrls?: string[];
    categories: CategoryInfo[];
    language?: string;
    settings: {
        mergeSimilarItems: boolean;
        autoRecognizeDate: boolean;
        autoConfirm: boolean;
    };
}


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
                mergeSimilarItems: false, // Handle merge in step 2
                language: input.language
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

            transactions = await summarizeTransactions(transactions, input.language, input.text);
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
            const transactionsToInsert = validTransactions.map(tx => {
                const categoryId = tx.category
                    ? input.categories.find((c) => c.name === tx.category)?.id ?? null
                    : null;

                return {
                    ledgerId: task.ledgerId!,
                    categoryId,
                    receiptId: input.receiptId,
                    amount: tx.amount.toString(),
                    currency: tx.currency,
                    itemName: tx.itemName || "未分类",
                    description: tx.notes || null,
                    transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(),
                };
            });

            if (transactionsToInsert.length > 0) {
                await db.insert(transactions).values(transactionsToInsert);
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


// Register the task handler
registerTask(TASK_TYPE_PARSE_RECEIPT, parseReceiptHandler);

export { parseReceiptHandler };
