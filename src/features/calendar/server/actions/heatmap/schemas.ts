/**
 * Heatmap Validation Schemas
 *
 * Zod schemas for heatmap action validation.
 */

import { z } from "zod";
import { dateStringSchema } from "@/lib/validation";

export const GetCalendarHeatmapSchema = z.object({
  ledgerId: z.string(),
  viewType: z.enum(["month", "year"]),
  anchorDate: dateStringSchema,
  filters: z
    .object({
      currency: z.string().optional(),
      categoryId: z.string().optional(),
    })
    .optional(),
});

export const GetDayDetailSchema = z.object({
  ledgerId: z.string(),
  date: dateStringSchema,
  filters: z
    .object({
      currency: z.string().optional(),
      categoryId: z.string().optional(),
    })
    .optional(),
});

export const GetCalendarHeatmapForRangeSchema = z.object({
  ledgerId: z.string(),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  filters: z
    .object({
      currency: z.string().optional(),
      categoryId: z.string().optional(),
    })
    .optional(),
});
