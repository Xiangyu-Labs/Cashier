# Error Handling Guide

This document describes the standardized error handling patterns used in Cashier.

## Overview

Cashier uses a unified error handling approach based on the `AppError` class hierarchy. This ensures consistent error responses across Server Actions, API Routes, and background tasks.

## Error Classes

All error classes are defined in `src/lib/errors.ts`:

### Base Class: AppError

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  )
}
```

### Specific Error Types

| Error Class | Status Code | Use Case |
|-------------|-------------|----------|
| `ValidationError` | 400 | Invalid input data |
| `UnauthorizedError` | 401 | Authentication required or failed |
| `ForbiddenError` | 403 | Permission denied |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Resource conflict (e.g., duplicate) |
| `RateLimitError` | 429 | Too many requests |

## Usage Patterns

### Server Actions

Server Actions should throw errors directly:

```typescript
import { ValidationError, NotFoundError } from "@/lib/errors";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";

export async function updateLedgerEntryAction(
  ledgerId: string,
  entryId: string,
  data: unknown
) {
  // Check access
  const { error } = await requireLedgerAccess(ledgerId);
  if (error) throw new UnauthorizedError("Access denied");

  // Validate input
  const result = updateSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Invalid input", { issues: result.error.issues });
  }

  // Check resource exists
  const entry = await db.query.ledgerEntries.findFirst({ ... });
  if (!entry) {
    throw new NotFoundError("Ledger entry");
  }

  // ... perform update
}
```

### API Routes

API Routes should use standardized error responses:

```typescript
import { NextResponse } from "next/server";
import { ValidationError, UnauthorizedError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

export async function POST(request: Request) {
  try {
    // Authorization check
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      throw new UnauthorizedError("Missing authorization header");
    }

    // Validation
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ValidationError("Invalid request body", { issues: result.error.issues });
    }

    // ... handle request

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    // Log error with appropriate level
    logError("api/my-endpoint", error);

    // Return standardized error response
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
```

### Error Response Format

All API errors return a consistent JSON structure:

```json
{
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "details": { /* optional additional context */ }
  }
}
```

Example responses:

```json
// ValidationError
{
  "error": {
    "message": "Invalid input",
    "code": "VALIDATION_ERROR",
    "details": {
      "issues": [
        { "path": ["email"], "message": "Invalid email format" }
      ]
    }
  }
}

// NotFoundError
{
  "error": {
    "message": "Ledger entry not found",
    "code": "NOT_FOUND"
  }
}

// Unexpected errors
{
  "error": {
    "message": "Internal Server Error",
    "code": "INTERNAL_ERROR"
  }
}
```

## Error Logging

Use `logError()` for consistent error logging:

```typescript
import { logError } from "@/lib/error-handlers";

// In catch blocks
} catch (error) {
  logError("context/operation", error);
  // Client errors (4xx) are logged at WARN level
  // Server errors (5xx) are logged at ERROR level
}
```

## Best Practices

1. **Throw Early**: Validate inputs and throw errors as soon as possible
2. **Use Specific Error Types**: Don't just throw generic `AppError`; use the specific subclasses
3. **Include Details**: Add relevant context to `details` for debugging
4. **Don't Leak Sensitive Info**: Error messages should not expose internal implementation details
5. **Always Log**: Use `logError()` in catch blocks for observability
6. **Consistent Handling**: Use `toErrorResponse()` for all API error responses

## Migration from Legacy Patterns

### Before: Returning error objects

```typescript
// Old pattern - don't use this
export async function myAction() {
  try {
    // ... logic
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: "Something went wrong" };
  }
}
```

### After: Throwing errors

```typescript
// New pattern - use this
export async function myAction() {
  // ... logic that may throw
  return result; // Return data directly, not wrapped
}
```

The caller handles errors using try/catch or React Query's error handling.
