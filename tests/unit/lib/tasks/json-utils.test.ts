import { describe, expect, it } from "vitest";
import {
  buildRepairPrompt,
  cleanJsonContent,
  extractJson,
  isValidJson,
  tryParseJson,
} from "@/lib/tasks/json-utils";

describe("JSON response utilities", () => {
  it("accepts valid JSON values and rejects malformed content", () => {
    for (const value of ['{"key":"value"}', "[1,2,3]", '"text"', "42", "true", "null"]) {
      expect(isValidJson(value)).toBe(true);
    }
    for (const value of ["", '{"key": invalid}', '{"key":"value",}']) {
      expect(isValidJson(value)).toBe(false);
    }
  });

  it("parses valid payloads and returns null for invalid payloads", () => {
    expect(tryParseJson<{ id: number }>('{"id":1}')).toEqual({ id: 1 });
    expect(tryParseJson("invalid json")).toBeNull();
  });

  it("removes markdown fences and surrounding whitespace", () => {
    expect(cleanJsonContent('  ```json\n{"key":"value"}\n```  ')).toBe('{"key":"value"}');
    expect(cleanJsonContent('  ```\n{"key":"value"}\n```  ')).toBe('{"key":"value"}');
  });

  it("extracts outer JSON objects and arrays from model prose", () => {
    expect(extractJson('Result: {"outer":{"value":1}} done')).toBe('{"outer":{"value":1}}');
    expect(extractJson("Result: [1,2,3] done")).toBe("[1,2,3]");
  });

  it("leaves plain model content available for the repair path", () => {
    expect(extractJson("  no structured result  ")).toBe("no structured result");
  });

  it("builds repair instructions for malformed JSON and extraction instructions for prose", () => {
    const malformed = '{"broken": value}';
    expect(buildRepairPrompt(malformed)).toContain(malformed);
    expect(buildRepairPrompt(malformed)).toContain("JSON repair");
    expect(buildRepairPrompt("plain response")).toContain("JSON extraction");
  });
});
