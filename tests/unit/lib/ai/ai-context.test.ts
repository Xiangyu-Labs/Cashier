import { describe, it, expect } from 'vitest';
import { withAIContext, getCurrentTaskRunId, getCurrentLedgerId } from '@/lib/ai/ai-context';

describe('AI Context', () => {
    it('should return undefined when no context is set', () => {
        expect(getCurrentTaskRunId()).toBeUndefined();
        expect(getCurrentLedgerId()).toBeUndefined();
    });

    it('should return the correct taskRunId and ledgerId within context', () => {
        const taskRunId = 'test-task-123';
        const ledgerId = 'test-ledger-abc';
        withAIContext(taskRunId, ledgerId, () => {
            expect(getCurrentTaskRunId()).toBe(taskRunId);
            expect(getCurrentLedgerId()).toBe(ledgerId);
        });
    });

    it('should return undefined after context exits', () => {
        const taskRunId = 'test-task-123';
        const ledgerId = 'test-ledger-abc';
        withAIContext(taskRunId, ledgerId, () => {
            expect(getCurrentTaskRunId()).toBe(taskRunId);
        });
        expect(getCurrentTaskRunId()).toBeUndefined();
        expect(getCurrentLedgerId()).toBeUndefined();
    });

    it('should handle nested contexts correctly', () => {
        const outerId = 'outer-id';
        const outerLedger = 'outer-ledger';
        const innerId = 'inner-id';
        const innerLedger = 'inner-ledger';

        withAIContext(outerId, outerLedger, () => {
            expect(getCurrentTaskRunId()).toBe(outerId);
            expect(getCurrentLedgerId()).toBe(outerLedger);

            withAIContext(innerId, innerLedger, () => {
                expect(getCurrentTaskRunId()).toBe(innerId);
                expect(getCurrentLedgerId()).toBe(innerLedger);
            });

            expect(getCurrentTaskRunId()).toBe(outerId);
            expect(getCurrentLedgerId()).toBe(outerLedger);
        });
    });

    it('should work with async functions', async () => {
        const taskRunId = 'async-id';
        const ledgerId = 'async-ledger';

        await withAIContext(taskRunId, ledgerId, async () => {
            expect(getCurrentTaskRunId()).toBe(taskRunId);
            expect(getCurrentLedgerId()).toBe(ledgerId);
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(getCurrentTaskRunId()).toBe(taskRunId);
            expect(getCurrentLedgerId()).toBe(ledgerId);
        });
    });
});
