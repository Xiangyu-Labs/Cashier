import { z } from "zod";

export const createLedgerSchema = z.object({
  aiLanguage: z.string().optional(),
});

export const updateLedgerSchema = z.object({
  settings: z
    .object({
      aiLanguage: z.string().optional(),
      currencies: z.array(z.string()).optional(),
      mainCurrency: z.string().optional(),
      collapseEntriesDefault: z.boolean().optional(),
      aiCustomPrompt: z.string().optional(),
    })
    .optional(),
});

export type CreateLedgerInput = z.infer<typeof createLedgerSchema>;
export type UpdateLedgerInput = z.infer<typeof updateLedgerSchema>;
