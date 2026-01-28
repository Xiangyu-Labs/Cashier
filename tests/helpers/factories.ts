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

export function createLedgerEntryData(
  ledgerId: string,
  overrides: Partial<{
    id: string;
    categoryId: string | null;
    sourceDocumentId: string | null;
    amount: string;
    currency: string | null;
    itemName: string;
    description: string | null;
    entryDate: Date | null;
    createdAt: Date;
  }> = {}
) {
  return {
    id: uuidv4(),
    ledgerId,
    categoryId: null,
    sourceDocumentId: null,
    amount: "25.50",
    currency: "CNY",
    itemName: "午餐",
    description: null,
    entryDate: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createSourceDocumentData(
  ledgerId: string,
  overrides: Partial<{
    id: string;
    title: string | null;
    text: string | null;
    imageUrls: string[];
    aiResponse: string | null;
    createdAt: Date;
  }> = {}
) {
  return {
    id: uuidv4(),
    ledgerId,
    title: null,
    text: "午餐花了25.5元",
    imageUrls: [],
    aiResponse: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createSourceDocumentInput(
  overrides: Partial<{
    text: string;
    images: Array<{ data: string; mimeType: string }>;
  }> = {}
) {
  return {
    text: "今天午餐花了25.5元",
    ...overrides,
  };
}
