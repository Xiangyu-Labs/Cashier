import { describe, it, expect } from 'vitest';
import {
  periodToDateRange,
  parsePeriodFromSearchParams,
  datesToPeriodParams,
  getBillingPeriod,
  type PeriodParams,
} from '@/lib/period-utils';

describe('period-utils', () => {
  describe('getBillingPeriod', () => {
    it('should return current period when today >= monthStartDay', () => {
      // monthStartDay=1 means period is always current calendar month
      const result = getBillingPeriod(1);
      const now = new Date();
      expect(result.startDate).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    });

    it('should handle month-end boundary (startDay=31 in Feb)', () => {
      const result = getBillingPeriod(31);
      expect(result.startDate).toBeTruthy();
      expect(result.endDate).toBeTruthy();
    });
  });

  describe('periodToDateRange', () => {
    it('should return null dates for "all" period', () => {
      const params: PeriodParams = { period: 'all' };
      const result = periodToDateRange(params);

      expect(result.startDate).toBeNull();
      expect(result.endDate).toBeNull();
    });

    it('should return billing period for "currentPeriod" with monthStartDay=1', () => {
      const params: PeriodParams = { period: 'currentPeriod', monthStartDay: 1 };
      const result = periodToDateRange(params);

      expect(result.startDate).not.toBeNull();
      expect(result.endDate).not.toBeNull();

      const now = new Date();
      const startDate = new Date(result.startDate!);
      expect(startDate.getDate()).toBe(1);
      expect(startDate.getMonth()).toBe(now.getMonth());
    });

    it('should return current month range for "thisMonth"', () => {
      const params: PeriodParams = { period: 'thisMonth' };
      const result = periodToDateRange(params);

      expect(result.startDate).not.toBeNull();
      expect(result.endDate).not.toBeNull();

      // Verify it's the current month
      const now = new Date();
      const startDate = new Date(result.startDate!);
      const endDate = new Date(result.endDate!);

      expect(startDate.getFullYear()).toBe(now.getFullYear());
      expect(startDate.getMonth()).toBe(now.getMonth());
      expect(startDate.getDate()).toBe(1); // First day of month

      expect(endDate.getFullYear()).toBe(now.getFullYear());
      expect(endDate.getMonth()).toBe(now.getMonth());
      // Last day of month
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      expect(endDate.getDate()).toBe(lastDay);
    });

    it('should return last 7 days for "week"', () => {
      const params: PeriodParams = { period: 'week' };
      const result = periodToDateRange(params);

      expect(result.startDate).not.toBeNull();
      expect(result.endDate).not.toBeNull();

      const startDate = new Date(result.startDate!);
      const endDate = new Date(result.endDate!);
      const now = new Date();

      // Start should be 7 days ago at 00:00:00
      const expectedStart = new Date(now);
      expectedStart.setDate(expectedStart.getDate() - 7);
      expectedStart.setHours(0, 0, 0, 0);

      expect(startDate.getDate()).toBe(expectedStart.getDate());
      expect(startDate.getMonth()).toBe(expectedStart.getMonth());

      // End should be today at 23:59:59
      expect(endDate.getDate()).toBe(now.getDate());
      expect(endDate.getMonth()).toBe(now.getMonth());
    });

    it('should return custom date range for "custom" with dates', () => {
      const params: PeriodParams = {
        period: 'custom',
        startDate: '2024-01-15',
        endDate: '2024-01-20',
      };
      const result = periodToDateRange(params);

      expect(result.startDate).not.toBeNull();
      expect(result.endDate).not.toBeNull();

      const startDate = new Date(result.startDate!);
      const endDate = new Date(result.endDate!);

      expect(startDate.getFullYear()).toBe(2024);
      expect(startDate.getMonth()).toBe(0); // January
      expect(startDate.getDate()).toBe(15);

      expect(endDate.getFullYear()).toBe(2024);
      expect(endDate.getMonth()).toBe(0);
      expect(endDate.getDate()).toBe(20);
    });

    it('should default to currentPeriod for unknown period', () => {
      const params = { period: 'invalid' as unknown as Parameters<typeof periodToDateRange>[0]['period'] };
      const result = periodToDateRange(params);

      // Should behave like currentPeriod (non-null dates)
      expect(result.startDate).not.toBeNull();
      expect(result.endDate).not.toBeNull();
    });

    it('should default to currentPeriod for custom without dates', () => {
      const params: PeriodParams = { period: 'custom' };
      const result = periodToDateRange(params);

      // Should behave like currentPeriod when dates are missing
      expect(result.startDate).not.toBeNull();
      expect(result.endDate).not.toBeNull();
    });
  });

  describe('parsePeriodFromSearchParams', () => {
    it('should parse URLSearchParams', () => {
      const searchParams = new URLSearchParams('period=week');
      const result = parsePeriodFromSearchParams(searchParams);

      expect(result.period).toBe('week');
    });

    it('should parse plain object from Next.js', () => {
      const searchParams = { period: 'thisMonth' };
      const result = parsePeriodFromSearchParams(searchParams);

      expect(result.period).toBe('thisMonth');
    });

    it('should parse custom period with dates', () => {
      const searchParams = new URLSearchParams(
        'period=custom&startDate=2024-01-01&endDate=2024-01-31'
      );
      const result = parsePeriodFromSearchParams(searchParams);

      expect(result.period).toBe('custom');
      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-01-31');
    });

    it('should default to currentPeriod for invalid period', () => {
      const searchParams = new URLSearchParams('period=invalid');
      const result = parsePeriodFromSearchParams(searchParams);

      expect(result.period).toBe('currentPeriod');
    });

    it('should default to currentPeriod when no period provided', () => {
      const searchParams = new URLSearchParams('');
      const result = parsePeriodFromSearchParams(searchParams);

      expect(result.period).toBe('currentPeriod');
    });

    it('should handle array values from Next.js searchParams', () => {
      const searchParams = { period: ['week', 'month'] }; // Array value
      const result = parsePeriodFromSearchParams(searchParams);

      // Should take first value
      expect(result.period).toBe('week');
    });

    it('should validate period against allowed values', () => {
      const validPeriods = ['currentPeriod', 'all', 'thisMonth', 'week', 'custom'];

      validPeriods.forEach(period => {
        const searchParams = new URLSearchParams(`period=${period}`);
        const result = parsePeriodFromSearchParams(searchParams);
        expect(result.period).toBe(period);
      });
    });
  });

  describe('datesToPeriodParams', () => {
    it('should return "currentPeriod" when no dates provided', () => {
      const result = datesToPeriodParams();

      expect(result.period).toBe('currentPeriod');
      expect(result.startDate).toBeUndefined();
      expect(result.endDate).toBeUndefined();
    });

    it('should return "currentPeriod" when only start date provided', () => {
      const result = datesToPeriodParams(new Date('2024-01-01'));

      expect(result.period).toBe('currentPeriod');
    });

    it('should return "currentPeriod" when only end date provided', () => {
      const result = datesToPeriodParams(undefined, new Date('2024-01-31'));

      expect(result.period).toBe('currentPeriod');
    });

    it('should return custom period with formatted dates', () => {
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-20');

      const result = datesToPeriodParams(startDate, endDate);

      expect(result.period).toBe('custom');
      expect(result.startDate).toBe('2024-01-15');
      expect(result.endDate).toBe('2024-01-20');
    });

    it('should format dates with leading zeros', () => {
      const startDate = new Date('2024-03-05');
      const endDate = new Date('2024-03-09');

      const result = datesToPeriodParams(startDate, endDate);

      expect(result.startDate).toBe('2024-03-05');
      expect(result.endDate).toBe('2024-03-09');
    });

    it('should handle dates across year boundary', () => {
      const startDate = new Date('2023-12-25');
      const endDate = new Date('2024-01-05');

      const result = datesToPeriodParams(startDate, endDate);

      expect(result.period).toBe('custom');
      expect(result.startDate).toBe('2023-12-25');
      expect(result.endDate).toBe('2024-01-05');
    });
  });

  describe('Integration: round-trip conversion', () => {
    it('should convert dates to params and back to dates', () => {
      const originalStart = new Date('2024-01-15');
      const originalEnd = new Date('2024-01-20');

      // Convert to params
      const params = datesToPeriodParams(originalStart, originalEnd);

      // Convert back to date range
      const dateRange = periodToDateRange(params);

      // Verify dates match (ignoring time component)
      const resultStart = new Date(dateRange.startDate!);
      const resultEnd = new Date(dateRange.endDate!);

      expect(resultStart.getFullYear()).toBe(originalStart.getFullYear());
      expect(resultStart.getMonth()).toBe(originalStart.getMonth());
      expect(resultStart.getDate()).toBe(originalStart.getDate());

      expect(resultEnd.getFullYear()).toBe(originalEnd.getFullYear());
      expect(resultEnd.getMonth()).toBe(originalEnd.getMonth());
      expect(resultEnd.getDate()).toBe(originalEnd.getDate());
    });
  });
});

