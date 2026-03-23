import type {
  CategoryRecognitionOutput,
  CompletenessCheckOutput,
  CurrencyRecognitionOutput,
  Stage1Results,
  TitleExtractionOutput,
  UserRequirementsOutput,
  ValidityCheckOutput,
} from "./types";

export { haveSameStringMembers } from "./stage1-task-runners";

export function finalizeStage1Execution({
  validity,
  completeness,
  currency,
  category,
  title,
  userRequirements,
}: {
  validity: ValidityCheckOutput;
  completeness: CompletenessCheckOutput;
  currency: CurrencyRecognitionOutput;
  category: CategoryRecognitionOutput;
  title: TitleExtractionOutput;
  userRequirements: UserRequirementsOutput | undefined;
}):
  | { isValid: true; isIncomplete: true; incompleteReason?: string; title: string }
  | { isValid: true; isIncomplete: false; results: Stage1Results } {
  if (!completeness.is_complete) {
    return {
      isValid: true,
      isIncomplete: true,
      title: title.title,
      ...(completeness.issue != null && completeness.issue !== ""
        ? { incompleteReason: completeness.issue }
        : {}),
    };
  }

  return {
    isValid: true,
    isIncomplete: false,
    results: {
      validity,
      currency,
      category,
      title,
      ...(userRequirements != null ? { userRequirements } : {}),
    },
  };
}
