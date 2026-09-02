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
    signal?: AbortSignal;
  }): Promise<{
    content: string;
    usage?: { promptTokens: number; completionTokens: number };
  }>;
}

export interface ParseSourceDocumentInput {
  text?: string;
  evidence?: ParseEvidence;
  categories: CategoryInfo[];
  aiLanguage?: string;
  settings: { aiCustomPrompt?: string };
  preferredCurrencies?: string[];
}

interface ParseEvidence {
  images: readonly { dataUrl: string }[];
}

export type ProcessingFailureCode =
  | "storage_failure"
  | "ai_provider_unavailable"
  | "ai_schema_invalid"
  | "exchange_rate_failure"
  | "processing_unavailable"
  | "processing_timeout";

export class ProcessingFailure extends Error {
  constructor(
    readonly code: ProcessingFailureCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ProcessingFailure";
  }
}

export interface ParseSourceDocumentOutput {
  ledgerEntries: ParsedLedgerEntry[];
  title?: string;
  anomalyReason?: string;
  verificationStatus: "passed" | "anomaly" | "invalid";
}

export type ParsePipelineResult =
  | { kind: "success"; title: string; ledgerEntries: ParsedLedgerEntry[]; wasArbitrated: boolean }
  | { kind: "invalid"; title: string }
  | { kind: "anomaly"; title: string; anomalyReason: string }
  | { kind: "cancelled" };

export class ProcessingCancelledError extends Error {
  constructor() {
    super("Processing cancelled");
    this.name = "ProcessingCancelledError";
  }
}

export function throwIfProcessingCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new ProcessingCancelledError();
}
