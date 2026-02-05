// ===== Stage 1 Types =====

export interface ValidityCheckInput {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
}

export interface ValidityCheckOutput {
    is_valid: boolean;
    reasoning: string;
}

export interface CompletenessCheckOutput {
    is_complete: boolean;
    issue?: string;
}

export interface CurrencyRecognitionInput {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
    preferredCurrencies?: string[];
}

export interface CurrencyRecognitionOutput {
    currencies: string[];
    reasoning: string;
}

export interface CategoryRecognitionInput {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
    categories: { name: string; description: string | null }[];
}

export interface CategoryRecognitionOutput {
    categories: string[];
    reasoning: string;
}

export interface TitleExtractionInput {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
}

export interface TitleExtractionOutput {
    title: string;
}

export interface UserRequirementsInput {
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
    aiCustomPrompt: string;
}

export interface UserRequirementsOutput {
    rules: string[];
}

// ===== Stage 1.5 Types =====

export interface ValidationSummary {
    is_reasonable: boolean;
    summary?: {
        title: string;
        currencies: { code: string; hint: string }[];
        categories: { name: string; hint: string }[];
        rules?: string[];
    };
    rejection_reason?: string;
}

// ===== Stage 2 Types =====

export interface ParsedEntry {
    item_name: string;
    amount: number;
    currency: string;
    category: string;
    entry_date: string;
    notes: string | null;
}

export interface DetailedParseOutput {
    ledger_entries: ParsedEntry[];
    reasoning: string;
}

// ===== Arbitration Types =====

export interface ArbitrationInput<T> {
    taskDescription: string;
    result1: T;
    reasoning1: string;
    result2: T;
    reasoning2: string;
    text?: string;
    imageUrls?: string[];
    aiLanguage?: string;
}

export interface ArbitrationOutput {
    choice: 0 | 1 | 2;
    reason?: string;
}

// ===== Stage 1 Aggregated Result =====

export interface Stage1Results {
    validity: ValidityCheckOutput;
    currency: CurrencyRecognitionOutput;
    category: CategoryRecognitionOutput;
    title: TitleExtractionOutput;
    userRequirements?: UserRequirementsOutput;
}
