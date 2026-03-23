import type { AIContext } from "@/lib/flow/types";
import { throwIfCancelled } from "@/lib/flow/cancellation";
import type { Stage1Results } from "./types";
import { buildMessageContent } from "./message-content";
import { finalizeStage1Execution } from "./stage1-result-policy";
import {
  runCategoryTask,
  runCompletenessTask,
  runCurrencyTask,
  runTitleTask,
  runUserRequirementsTask,
  runValidityTask,
} from "./stage1-task-runners";

export interface Stage1Input {
  text?: string;
  imageUrls?: string[];
  visionDescription?: string;
  aiLanguage?: string;
  preferredCurrencies?: string[];
  categories: { name: string; description: string | null }[];
  aiCustomPrompt?: string;
}

export async function executeStage1(
  input: Stage1Input,
  ai: AIContext,
  signal?: AbortSignal
): Promise<
  | { isValid: false; title: string }
  | { isValid: true; isIncomplete: true; incompleteReason?: string; title: string }
  | { isValid: true; isIncomplete: false; results: Stage1Results }
> {
  const messageContent = buildMessageContent(input.text, input.imageUrls, input.visionDescription);

  const [validityResult, titleResult] = await Promise.all([
    runValidityTask(messageContent, input.aiLanguage, ai),
    runTitleTask(messageContent, input.aiLanguage, ai),
  ]);

  if (!validityResult.is_valid) {
    return { isValid: false, title: titleResult.title };
  }

  throwIfCancelled(signal);

  const [completenessResult, currencyResult, categoryResult, userReqResult] = await Promise.all([
    runCompletenessTask(messageContent, input.aiLanguage, ai),
    runCurrencyTask(messageContent, input.aiLanguage, input.preferredCurrencies, ai),
    runCategoryTask(messageContent, input.aiLanguage, input.categories, ai),
    runUserRequirementsTask(messageContent, input.aiLanguage, input.aiCustomPrompt, ai),
  ]);

  return finalizeStage1Execution({
    validity: validityResult,
    completeness: completenessResult,
    currency: currencyResult,
    category: categoryResult,
    title: titleResult,
    userRequirements: userReqResult,
  });
}
