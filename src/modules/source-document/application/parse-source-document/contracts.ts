import type { CategoryInfo, ParsedLedgerEntry } from "@/lib/ai/types";

export type AiMessageContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface AiContextContract {
  generate(options: {
    prompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string | AiMessageContentPart[] }>;
    model: "text" | "vision";
    maxTokens?: number;
    temperature?: number;
    requireJson?: boolean;
    autoReportTokens?: boolean;
  }): Promise<{
    content: string;
    usage?: { promptTokens: number; completionTokens: number };
  }>;
}

export interface ParseSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  text?: string;
  storedFileIds?: string[];
  categories: CategoryInfo[];
  aiLanguage?: string;
  settings: { aiCustomPrompt?: string };
  preferredCurrencies?: string[];
}

export interface ParseSourceDocumentOutput {
  ledgerEntries: ParsedLedgerEntry[];
  title?: string;
  anomalyReason?: string;
  verificationStatus: "passed" | "anomaly" | "invalid";
}

export class ProcessingCancelledError extends Error {
  constructor() {
    super("Processing cancelled");
    this.name = "ProcessingCancelledError";
  }
}

export function throwIfProcessingCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new ProcessingCancelledError();
}
