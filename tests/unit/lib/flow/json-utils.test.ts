import { describe, it, expect } from "vitest";
import {
    isValidJson,
    tryParseJson,
    cleanJsonContent,
    extractJson,
    buildRepairPrompt,
} from "@/lib/flow/json-utils";

describe("isValidJson", () => {
    it("should return true for valid JSON object", () => {
        expect(isValidJson('{"key": "value"}')).toBe(true);
    });

    it("should return true for valid JSON array", () => {
        expect(isValidJson('[1, 2, 3]')).toBe(true);
    });

    it("should return true for valid JSON string", () => {
        expect(isValidJson('"hello"')).toBe(true);
    });

    it("should return true for valid JSON number", () => {
        expect(isValidJson('42')).toBe(true);
    });

    it("should return true for valid JSON boolean", () => {
        expect(isValidJson('true')).toBe(true);
    });

    it("should return true for valid JSON null", () => {
        expect(isValidJson('null')).toBe(true);
    });

    it("should return false for invalid JSON", () => {
        expect(isValidJson('{"key": invalid}')).toBe(false);
    });

    it("should return false for empty string", () => {
        expect(isValidJson('')).toBe(false);
    });

    it("should return false for undefined", () => {
        expect(isValidJson(undefined as unknown as string)).toBe(false);
    });

    it("should return false for unclosed braces", () => {
        expect(isValidJson('{"key": "value"')).toBe(false);
    });

    it("should return false for trailing comma", () => {
        expect(isValidJson('{"key": "value",}')).toBe(false);
    });
});

describe("tryParseJson", () => {
    it("should parse valid JSON and return data", () => {
        const result = tryParseJson('{"key": "value"}');
        expect(result).toEqual({ key: "value" });
    });

    it("should return null for invalid JSON", () => {
        const result = tryParseJson('invalid json');
        expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
        const result = tryParseJson('');
        expect(result).toBeNull();
    });

    it("should parse with generic type", () => {
        interface TestType {
            id: number;
            name: string;
        }
        const result = tryParseJson<TestType>('{"id": 1, "name": "test"}');
        expect(result).toEqual({ id: 1, name: "test" });
    });
});

describe("cleanJsonContent", () => {
    it("should remove json markdown code fence", () => {
        const input = '```json\n{"key": "value"}\n```';
        const result = cleanJsonContent(input);
        expect(result).toBe('{"key": "value"}');
    });

    it("should remove generic markdown code fence", () => {
        const input = '```\n{"key": "value"}\n```';
        const result = cleanJsonContent(input);
        expect(result).toBe('{"key": "value"}');
    });

    it("should trim whitespace", () => {
        const input = '   {"key": "value"}   ';
        const result = cleanJsonContent(input);
        expect(result).toBe('{"key": "value"}');
    });

    it("should return plain JSON unchanged", () => {
        const input = '{"key": "value"}';
        const result = cleanJsonContent(input);
        expect(result).toBe('{"key": "value"}');
    });

    it("should handle empty string", () => {
        const result = cleanJsonContent('');
        expect(result).toBe('');
    });

    it("should handle only whitespace", () => {
        const result = cleanJsonContent('   ');
        expect(result).toBe('');
    });
});

describe("extractJson", () => {
    it("should return cleaned content if it starts with {", () => {
        const input = '```json\n{"key": "value"}\n```';
        const result = extractJson(input);
        expect(result).toBe('{"key": "value"}');
    });

    it("should return cleaned content if it starts with [", () => {
        const input = '```json\n[1, 2, 3]\n```';
        const result = extractJson(input);
        expect(result).toBe('[1, 2, 3]');
    });

    it("should extract JSON object from surrounding text", () => {
        const input = 'Here is the result: {"key": "value"} Thank you!';
        const result = extractJson(input);
        expect(result).toBe('{"key": "value"}');
    });

    it("should extract JSON array from surrounding text", () => {
        const input = 'Data: [1, 2, 3] End of data';
        const result = extractJson(input);
        expect(result).toBe('[1, 2, 3]');
    });

    it("should extract the outermost object when multiple present", () => {
        const input = 'Text before {"key": "value"} text after';
        const result = extractJson(input);
        expect(result).toBe('{"key": "value"}');
    });

    it("should return cleaned content when no JSON markers found", () => {
        const input = 'Some plain text without JSON';
        const result = extractJson(input);
        expect(result).toBe('Some plain text without JSON');
    });

    it("should handle empty string", () => {
        const result = extractJson('');
        expect(result).toBe('');
    });

    it("should extract nested objects", () => {
        const input = 'Text {"outer": {"inner": "value"}} more text';
        const result = extractJson(input);
        expect(result).toBe('{"outer": {"inner": "value"}}');
    });
});

describe("buildRepairPrompt", () => {
    it("should include original content in repair prompt", () => {
        const input = '{"broken": json}';
        const result = buildRepairPrompt(input);
        expect(result).toContain(input);
    });

    it("should mention JSON repair for content with braces", () => {
        const input = '{"key": value}';
        const result = buildRepairPrompt(input);
        expect(result).toContain("JSON repair");
        expect(result).toContain("malformed");
    });

    it("should mention JSON extraction for content without braces", () => {
        const input = 'This is just plain text';
        const result = buildRepairPrompt(input);
        expect(result).toContain("JSON extraction");
        expect(result).toContain("natural language");
    });

    it("should include rules for repair", () => {
        const input = '{"key": "value"}';
        const result = buildRepairPrompt(input);
        expect(result).toContain("Rules:");
        expect(result).toContain("Return ONLY");
    });

    it("should handle empty string", () => {
        const result = buildRepairPrompt('');
        expect(result).toContain("JSON extraction");
    });
});
