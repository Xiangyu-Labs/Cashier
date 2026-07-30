import { describe, expect, it } from "vitest";
import {
  AI_OUTPUT_COPY,
  buildAiOutputLocaleInstruction,
  getAiOutputCopy,
} from "@/config/ai-output-locales";
import { AI_LANGUAGES } from "@/config/languages";

describe("AI output locales", () => {
  it("has deterministic user-facing copy for every selectable AI language", () => {
    expect(Object.keys(AI_OUTPUT_COPY).sort()).toEqual(
      AI_LANGUAGES.map((language) => language.value).sort()
    );

    for (const language of AI_LANGUAGES) {
      expect(
        Object.values(getAiOutputCopy(language.value)).every((value) => value.length > 0)
      ).toBe(true);
    }
  });

  it("describes Japanese as a native-user bookkeeping locale", () => {
    const instruction = buildAiOutputLocaleInstruction("ja-JP");

    expect(instruction).toContain("日本語 (ja-JP)");
    expect(instruction).toContain("native user");
    expect(instruction).toContain("title, ledger_entries[].item_name");
    expect(instruction).toContain("higher priority than Additional Instructions");
  });

  it("uses English deterministic copy for an unrecognized locale", () => {
    expect(getAiOutputCopy("xx-TEST").untitledDocument).toBe("Untitled document");
  });
});
