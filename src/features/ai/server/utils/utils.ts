import { z } from "zod";

const summarizationSchema = z.object({
    item_name: z.string(),
    notes: z.string().nullable().optional(),
});
