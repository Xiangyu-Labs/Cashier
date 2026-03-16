import { z } from "zod";

export const createLedgerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    aiLanguage: z.string().optional(),
});

export const updateLedgerSchema = z.object({
    name: z.string().optional(),
    settings: z.object({
        aiLanguage: z.string().optional(),
        currencies: z.array(z.string()).optional(),
        mainCurrency: z.string().optional(),
        collapseEntriesDefault: z.boolean().optional(),
        aiCustomPrompt: z.string().optional(),
        monthStartDay: z.number().min(1).max(31).optional(),
    }).optional(),
});

export type CreateLedgerInput = z.infer<typeof createLedgerSchema>;
export type UpdateLedgerInput = z.infer<typeof updateLedgerSchema>;
