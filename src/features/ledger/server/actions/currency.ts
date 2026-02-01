'use server';

import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";
import { revalidatePath } from "next/cache";

export interface ConvertCurrencyResult {
    success: boolean;
    converted?: number;
    error?: string;
}

export async function convertCurrencyAction(
    amount: number,
    from: string,
    to: string,
    date?: string
): Promise<ConvertCurrencyResult> {
    try {
        if (!amount || !from || !to) {
            return { success: false, error: "Missing required parameters" };
        }

        const dateObj = date ? new Date(date) : undefined;
        // Use static method directly
        const converted = await ExchangeRateService.convert(amount, from, to, dateObj);

        return { success: true, converted };
    } catch (error) {
        console.error("Currency conversion failed:", error);
        return { success: false, error: "Conversion failed" };
    }
}
