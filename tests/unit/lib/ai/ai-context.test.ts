import { describe, it, expect } from 'vitest';
import { withAIContext, getCurrentTaskRunId } from '@/lib/ai/ai-context';

describe('AI Context', () => {
    it('should return undefined when no context is set', () => {
        expect(getCurrentTaskRunId()).toBeUndefined();
    });

    it('should return the correct taskRunId within context', () => {
        const taskRunId = 'test-task-123';
        withAIContext(taskRunId, () => {
            expect(getCurrentTaskRunId()).toBe(taskRunId);
        });
    });

    it('should return undefined after context exits', () => {
        const taskRunId = 'test-task-123';
        withAIContext(taskRunId, () => {
            expect(getCurrentTaskRunId()).toBe(taskRunId);
        });
        expect(getCurrentTaskRunId()).toBeUndefined();
    });

    it('should handle nested contexts correctly', () => {
        const outerId = 'outer-id';
        const innerId = 'inner-id';

        withAIContext(outerId, () => {
            expect(getCurrentTaskRunId()).toBe(outerId);

            withAIContext(innerId, () => {
                expect(getCurrentTaskRunId()).toBe(innerId);
            });

            expect(getCurrentTaskRunId()).toBe(outerId);
        });
    });

    it('should work with async functions', async () => {
        const taskRunId = 'async-id';

        await withAIContext(taskRunId, async () => {
            expect(getCurrentTaskRunId()).toBe(taskRunId);
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(getCurrentTaskRunId()).toBe(taskRunId);
        });
    });
});
