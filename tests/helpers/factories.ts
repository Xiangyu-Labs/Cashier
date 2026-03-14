import { v4 as uuidv4 } from "uuid";

export function createLedgerData(
  overrides: Partial<{
    id: string;
    userId: string;
    name: string;
    aiLanguage: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id: uuidv4(),
    userId: uuidv4(),
    name: `Test Ledger ${Date.now()}`,
    aiLanguage: "zh-CN",
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
    sourceDocumentId: string;
    amount: string;
    currency: string | null;
    itemName: string;
    description: string | null;
    entryDate: string | null; // yyyy-MM-dd format
    createdAt: Date;
  }> = {}
) {
  // sourceDocumentId is required by schema, so generate one if not provided
  const sourceDocumentId = overrides.sourceDocumentId || uuidv4();

  return {
    id: uuidv4(),
    ledgerId,
    categoryId: null,
    sourceDocumentId,
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
    metadata: Record<string, unknown>;
    status: "queued" | "processing" | "completed" | "anomaly" | "failed";
    type: "receipt" | "invoice" | "note" | null;
    anomalyReason: string | null;
    entryDate: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }> = {}
) {
  const now = new Date();
  return {
    id: uuidv4(),
    ledgerId,
    title: null,
    text: "午餐花了25.5元",
    imageUrls: [],
    metadata: {},
    status: "completed" as const,
    type: "note" as const,
    anomalyReason: null,
    entryDate: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
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
