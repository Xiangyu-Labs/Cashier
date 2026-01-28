// SourceDocumentProcessor 类型定义

export interface SourceDocumentInput {
    text?: string;
    images?: Array<{
        data: string; // Base64 或 URL
        mimeType: string; // image/jpeg, image/png, etc.
    }>;
}

export interface ParsedLedgerEntry {
    itemName: string;
    amount: number;
    currency: string | null;
    category: string | null; // 分类名称
    transactionDate: string | null; // YYYY-MM-DD 格式
    notes?: string | null; // Consolidated notes
}

export interface ProcessingResult {
    ledgerEntries: ParsedLedgerEntry[];
    isValid?: boolean;
    title?: string;
    rawResponse: string; // AI 原始返回，用于调试
}

export interface CategoryInfo {
    id: string;
    name: string;
    description: string | null;
}

export interface ProcessorContext {
    categories: CategoryInfo[];
    mergeSimilarItems?: boolean;
    language?: string;
}

export interface SourceDocumentProcessor {
    process(input: SourceDocumentInput, context: ProcessorContext): Promise<ProcessingResult>;
}

export type SourceType = "text" | "image" | "mixed";

export function determineSourceType(input: SourceDocumentInput): SourceType {
    const hasText = !!input.text;
    const hasImages = !!(input.images && input.images.length > 0);

    if (hasText && hasImages) return "mixed";
    if (hasImages) return "image";
    return "text";
}
