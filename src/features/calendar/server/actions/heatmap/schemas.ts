/**
 * Heatmap Validation Schemas
 *
 * Zod schemas for heatmap action validation.
 */

import { z } from 'zod';

export const GetCalendarHeatmapSchema = z.object({
    ledgerId: z.string(),
    viewType: z.enum(['month', 'year']),
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    filters: z
        .object({
            currency: z.string().optional(),
            categoryId: z.string().optional(),
        })
        .optional(),
});

export const GetDayDetailSchema = z.object({
    ledgerId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    filters: z
        .object({
            currency: z.string().optional(),
            categoryId: z.string().optional(),
        })
        .optional(),
});

export const GetCalendarHeatmapForRangeSchema = z.object({
    ledgerId: z.string(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    filters: z
        .object({
            currency: z.string().optional(),
            categoryId: z.string().optional(),
        })
        .optional(),
});
