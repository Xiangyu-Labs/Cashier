import { z } from "zod";

const withReasoning = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({ reasoning: z.string() });

export const validitySchema = withReasoning(
  z.object({
    is_valid: z.boolean(),
  })
);
