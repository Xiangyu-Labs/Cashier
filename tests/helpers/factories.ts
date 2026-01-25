import { v4 as uuidv4 } from "uuid";

export function createLedgerData(
  overrides: Partial<{
    id: string;
    name: string;
    language: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id: uuidv4(),
    name: `Test Ledger ${Date.now()}`,
    language: "zh-CN",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createCategoryData(
  ledgerId: string,
  overrides: Partial<{
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id: uuidv4(),
    ledgerId,
    name: "餐饮",
    description: "外卖、堂食、食材采购",
    icon: "🍽️",
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTransactionData(
  ledgerId: string,
  overrides: Partial<{
    id: string;
    categoryId: string | null;
    inputMessageId: string | null;
    amount: string;
    currency: string | null;
    itemName: string;
    description: string | null;
    status: "pending" | "confirmed";
    sourceType: "text" | "image" | "audio" | "mixed";
    transactionDate: Date | null;
    createdAt: Date;
  }> = {}
) {
  return {
    id: uuidv4(),
    ledgerId,
    categoryId: null,
    inputMessageId: null,
    amount: "25.50",
    currency: "CNY",
    itemName: "午餐",
    description: null,
    status: "pending" as const,
    sourceType: "text" as const,
    transactionDate: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createInputMessageData(
  ledgerId: string,
  overrides: Partial<{
    id: string;
    contentType: "text" | "image" | "audio";
    content: string;
    aiResponse: string | null;
    createdAt: Date;
  }> = {}
) {
  return {
    id: uuidv4(),
    ledgerId,
    contentType: "text" as const,
    content: "午餐花了25.5元",
    aiResponse: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMessageInput(
  overrides: Partial<{
    text: string;
    images: Array<{ data: string; mimeType: string }>;
    audio: { data: string; mimeType: string };
  }> = {}
) {
  return {
    text: "今天午餐花了25.5元",
    ...overrides,
  };
}
