export const SUPPORTED_CURRENCIES = [
    "USD", "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
    "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR",
    "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "ZAR"
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const DEFAULT_CURRENCIES: string[] = [
    "AUD", "BRL", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "SGD"
];
