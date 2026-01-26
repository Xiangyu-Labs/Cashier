// MessageProcessor 类型定义

export interface MessageInput {
  text?: string;
  images?: Array<{
    data: string; // Base64 或 URL
    mimeType: string; // image/jpeg, image/png, etc.
  }>;
}

export interface ParsedTransaction {
  itemName: string;
  amount: number;
  currency: string | null;
  category: string | null; // 分类名称，需要匹配到 categoryId
  transactionDate: string | null; // YYYY-MM-DD 格式
  metadata?: {
    quantity?: number;
    unitPrice?: number;
    unit?: string;
    originalName?: string;
    notes?: string;
  } | null;
}

export interface ProcessResult {
  transactions: ParsedTransaction[];
  rawResponse: string; // AI 原始返回，用于调试
}

export interface CategoryInfo {
  id: string;
  name: string;
  description: string | null;
}

export interface ProcessorContext {
  ledgerId: string;
  language: string; // 偏好语言
  categories: CategoryInfo[];
}

export interface MessageProcessor {
  process(input: MessageInput, context: ProcessorContext): Promise<ProcessResult>;
}

export type SourceType = "text" | "image" | "mixed";

export function determineSourceType(input: MessageInput): SourceType {
  const hasText = !!input.text;
  const hasImages = input.images && input.images.length > 0;

  const count = [hasText, hasImages].filter(Boolean).length;

  if (count > 1) return "mixed";
  if (hasImages) return "image";
  return "text";
}
