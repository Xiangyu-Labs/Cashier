import { describe, it, expect } from 'vitest'
import { isValidJson, tryParseJson, cleanJsonContent, extractJson, buildRepairPrompt } from '@/lib/flow/json-utils'

describe('json-utils', () => {
  describe('isValidJson', () => {
    it('should return true for valid JSON object', () => {
      expect(isValidJson('{"key": "value"}')).toBe(true)
    })

    it('should return true for valid JSON array', () => {
      expect(isValidJson('[1, 2, 3]')).toBe(true)
    })

    it('should return false for invalid JSON', () => {
      expect(isValidJson('{key: value}')).toBe(false)
    })

    it('should return false for markdown wrapped JSON', () => {
      expect(isValidJson('```json\n{"key": "value"}\n```')).toBe(false)
    })

    it('should return true for empty object', () => {
      expect(isValidJson('{}')).toBe(true)
    })

    it('should return true for empty array', () => {
      expect(isValidJson('[]')).toBe(true)
    })
  })

  describe('tryParseJson', () => {
    it('should parse valid JSON', () => {
      const result = tryParseJson<{ key: string }>('{"key": "value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should return null for invalid JSON', () => {
      const result = tryParseJson('{key: value}')
      expect(result).toBeNull()
    })
  })

  describe('cleanJsonContent', () => {
    it('should remove ```json fences', () => {
      expect(cleanJsonContent('```json\n{"key": "value"}\n```')).toBe('{"key": "value"}')
    })

    it('should remove ``` fences', () => {
      expect(cleanJsonContent('```\n{"key": "value"}\n```')).toBe('{"key": "value"}')
    })

    it('should trim whitespace', () => {
      expect(cleanJsonContent('  {"key": "value"}  ')).toBe('{"key": "value"}')
    })

    it('should handle multiple newlines', () => {
      expect(cleanJsonContent('```json\n\n{"key": "value"}\n\n```')).toBe('{"key": "value"}')
    })
  })

  describe('extractJson', () => {
    it('should extract JSON object from surrounding text', () => {
      const result = extractJson('Here is the data: {"key": "value"} and more')
      expect(result).toBe('{"key": "value"}')
    })

    it('should return cleaned content if already valid JSON object', () => {
      expect(extractJson('{"key": "value"}')).toBe('{"key": "value"}')
    })

    it('should return cleaned content if already valid JSON array', () => {
      expect(extractJson('[1, 2, 3]')).toBe('[1, 2, 3]')
    })

    it('should handle markdown wrapped JSON', () => {
      const result = extractJson('```json\n{"key": "value"}\n```')
      expect(result).toBe('{"key": "value"}')
    })

    it('should extract JSON array from surrounding text', () => {
      const result = extractJson('Items: [1, 2, 3] done')
      expect(result).toBe('[1, 2, 3]')
    })
  })

  describe('buildRepairPrompt', () => {
    it('should include original content', () => {
      const prompt = buildRepairPrompt('{key: value}')
      expect(prompt).toContain('{key: value}')
    })

    it('should include repair instructions', () => {
      const prompt = buildRepairPrompt('{}')
      expect(prompt).toContain('JSON repair assistant')
      expect(prompt).toContain('Return ONLY the corrected JSON')
    })
  })
})
