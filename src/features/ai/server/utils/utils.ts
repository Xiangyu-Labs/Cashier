import { z } from "zod";
import { ParsedLedgerEntry } from "../types";
import { getOpenAIClient } from "../services/openai";
import { logger } from "@/lib/logger";

const summarizationSchema = z.object({
    item_name: z.string(),
    notes: z.string().nullable().optional(),
});

