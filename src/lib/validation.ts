/**
 * Validation Utilities
 *
 * Shared validation functions used across the application.
 */

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
export const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (!isValidUuid(id)) {
        throw new Error(message || `Invalid UUID: ${id}`);
    }
}
