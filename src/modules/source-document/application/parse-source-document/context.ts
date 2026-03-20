import type { AIContext } from "@/lib/flow/types";
import { forLedger } from "@/lib/db/scoped-query";
import { sourceDocuments } from "@/persistence";

export interface StageContext {
  signal: AbortSignal;
  ai: AIContext;
  setProgress: (message: string) => Promise<void>;
  docId: string;
  ledgerId: string;
  q: ReturnType<typeof forLedger>;
}

interface BuildStageContextParams {
  signal: AbortSignal;
  ai: AIContext;
  setProgress: (message: string) => Promise<void>;
  docId: string;
  ledgerId: string;
}

export function buildStageContext({
  signal,
  ai,
  setProgress,
  docId,
  ledgerId,
}: BuildStageContextParams): StageContext {
  return {
    signal,
    ai,
    setProgress,
    docId,
    ledgerId,
    q: forLedger(sourceDocuments, ledgerId),
  };
}
