/**
 * Validation Utilities
 *
 * Shared validation functions used across the application.
 */

import { z } from "zod";
import { isValidDateString } from "./date-utils";
import { ValidationError } from "./errors";

/**
 * UUID v4 validation regex.
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where y is 8, 9, a, or b (version 4 variant bits)
 *
 * This ensures strict validation of UUID v4 format, rejecting:
 * - UUID v1 (contains timestamp/MAC info, privacy risk)
 * - UUID v3/v5 (namespace-based, not random)
 * - Invalid variant bits
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate if a string is a valid UUID v4
 * @param id - The string to validate
 * @returns true if valid UUID v4, false otherwise
 */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Assert that a value is a valid UUID v4
 * @param id - The string to validate
 * @param message - Optional error message
 * @throws Error if not a valid UUID v4
 */
export function assertValidUuid(id: string, message?: string): void {
  if (isValidUuid(id) === false) {
    throw new ValidationError(message ?? `Invalid UUID: ${id}`);
  }
}

/**
 * Shared YYYY-MM-DD validation schema.
 * Keeps date-only validation logic consistent across APIs and server actions.
 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((date) => isValidDateString(date), "Invalid date");

/**
 * Optional YYYY-MM-DD validation schema.
 */
export const optionalDateStringSchema = dateStringSchema.optional();

export function omitUndefinedObjectFields(input: unknown): unknown {
  if (input == null || Array.isArray(input) || typeof input !== "object") {
    return input;
  }

  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

type WithoutUndefinedValues<T extends object> = {
  [K in keyof T]?: Exclude<T[K], undefined>;
};

type WithoutNullishValues<T extends object> = {
  [K in keyof T]?: Exclude<T[K], null | undefined>;
};

export function omitUndefinedProperties<T extends object>(input: T): WithoutUndefinedValues<T> {
  const result: WithoutUndefinedValues<T> = {};

  for (const [key, value] of Object.entries(input) as Array<[keyof T, T[keyof T]]>) {
    if (value !== undefined) {
      result[key] = value as Exclude<T[keyof T], undefined>;
    }
  }

  return result;
}

export function omitNullishProperties<T extends object>(input: T): WithoutNullishValues<T> {
  const result: WithoutNullishValues<T> = {};

  for (const [key, value] of Object.entries(input) as Array<[keyof T, T[keyof T]]>) {
    if (value !== undefined && value !== null) {
      result[key] = value as Exclude<T[keyof T], null | undefined>;
    }
  }

  return result;
}
