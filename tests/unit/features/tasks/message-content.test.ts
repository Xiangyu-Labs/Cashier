import { describe, it, expect } from 'vitest'
import { buildMessageContent } from '@/features/source-document/server/tasks/message-content'

describe('buildMessageContent', () => {
    it('returns text part when only text provided', () => {
        const result = buildMessageContent('hello')
        expect(result).toEqual([{ type: 'text', text: 'hello' }])
    })

    it('returns image parts when only imageUrls provided', () => {
        const result = buildMessageContent(undefined, ['data:image/jpeg;base64,abc'])
        expect(result).toEqual([
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
        ])
    })

    it('returns vision description text when visionDescription provided', () => {
        const result = buildMessageContent(undefined, ['data:image/jpeg;base64,abc'], 'A receipt for ¥45')
        expect(result).toEqual([
            { type: 'text', text: '[Document Description]\nA receipt for ¥45' },
        ])
    })

    it('visionDescription takes precedence over imageUrls', () => {
        const result = buildMessageContent(undefined, ['data:image/jpeg;base64,abc'], 'A receipt')
        const types = result.map(p => p.type)
        expect(types).not.toContain('image_url')
        expect(types).toContain('text')
    })

    it('includes both text and visionDescription', () => {
        const result = buildMessageContent('user note', undefined, 'A receipt for ¥45')
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ type: 'text', text: 'user note' })
        expect(result[1]).toEqual({ type: 'text', text: '[Document Description]\nA receipt for ¥45' })
    })

    it('includes both text and imageUrls when no visionDescription', () => {
        const result = buildMessageContent('user note', ['data:image/jpeg;base64,abc'])
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ type: 'text', text: 'user note' })
        expect(result[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } })
    })

    it('returns fallback when no input provided', () => {
        const result = buildMessageContent()
        expect(result).toEqual([{ type: 'text', text: '[No input provided]' }])
    })

    it('handles multiple imageUrls', () => {
        const result = buildMessageContent(undefined, ['url1', 'url2'])
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ type: 'image_url', image_url: { url: 'url1' } })
        expect(result[1]).toEqual({ type: 'image_url', image_url: { url: 'url2' } })
    })
})
