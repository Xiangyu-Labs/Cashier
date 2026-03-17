import { type z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Parse JSON response from AI, cleaning potential markdown code fences
 * and validating against a Zod schema.
 *
 * @param content - Raw string content from AI
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated data
 * @throws ZodError if validation fails
 */
export function parseJsonResponse<T>(content: string, schema: z.ZodSchema<T>): T {
  // Clean potential markdown code fences
  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    logger.error(
      { content: cleaned.substring(0, 500), errors: result.error.issues },
      "Zod validation failed for AI response"
    );
    throw result.error;
  }
  return result.data;
}
