/**
 * Currency Service
 *
 * Provides unified currency conversion and formatting operations.
 * Extracted from Server Actions to reduce duplication.
 */

import { ExchangeRateService } from "./exchange-rate-service";
import { logger } from "@/lib/logger";

export interface ConversionResult {
    convertedAmount: string;
    exchangeRate: string;
}

export interface ConversionInput {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
    date?: string;
}

export class CurrencyService {
    /**
     * Convert an entry amount and format the result
     */
    static async convertEntryAmount(input: ConversionInput): Promise<ConversionResult | null> {
        const { amount, fromCurrency, toCurrency, date } = input;

        // Same currency - no conversion needed
        if (fromCurrency === toCurrency) {
            return {
                convertedAmount: amount.toFixed(2),
                exchangeRate: "1",
            };
        }

        try {
            const converted = await ExchangeRateService.convert(
                amount,
                fromCurrency,
                toCurrency,
                date
            );

            return {
                convertedAmount: converted.toFixed(2),
                exchangeRate: (converted / amount).toFixed(6),
            };
        } catch (err) {
            logger.warn(
                { err, fromCurrency, toCurrency, date },
                "Currency conversion failed"
            );
            return null;
        }
    }

    /**
     * Format amount to standard decimal string (2 decimal places)
     */
    static formatAmount(amount: number): string {
        return amount.toFixed(2);
    }

    /**
     * Calculate exchange rate between two amounts
     */
    static calculateExchangeRate(fromAmount: number, toAmount: number): string {
        return (toAmount / fromAmount).toFixed(6);
    }
}
