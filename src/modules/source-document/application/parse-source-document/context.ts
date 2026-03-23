import type { AIContext } from "@/lib/flow/types";

export interface StageContext {
  signal: AbortSignal;
  ai: AIContext;
  setProgress: (message: string) => Promise<void>;
  docId: string;
  ledgerId: string;
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
  };
}
