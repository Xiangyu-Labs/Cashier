import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/validation";

// ============================================================================
// Error Response Helpers
// ============================================================================

/**
 * Create a standardized error response
 */
function createErrorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Create an unauthorized (401) error response
 */
function unauthorized(): NextResponse {
  return createErrorResponse("Unauthorized", 401);
}

/**
 * Create a not found (404) error response
 */
function notFound(message = "Not found"): NextResponse {
  return createErrorResponse(message, 404);
}

/**
 * Get the current authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Get the current user ID from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * Require authentication for an API route.
 * Returns the user if authenticated, or a 401 response if not.
 */
export async function requireAuth(): Promise<
  | { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; error?: never }
  | { user?: never; error: NextResponse }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { error: unauthorized() };
  }

  return { user };
}

/**
 * Verify that a ledger belongs to the current user.
 * Returns the ledger if found and owned, or an error response.
 */
export async function verifyLedgerOwnership(
  ledgerId: string
): Promise<
  { ledger: typeof ledgers.$inferSelect; error?: never } | { ledger?: never; error: NextResponse }
> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return { error: unauthorized() };
  }

  if (!isValidUuid(ledgerId)) {
    return { error: notFound("Invalid ledger ID") };
  }

  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
  });

  if (!ledger) {
    return { error: notFound("Ledger not found") };
  }

  return { ledger };
}

/**
 * Helper to get user ID, verify ledger ownership.
 * This is the primary way to access ledger data securely.
 */
export async function requireLedgerAccess(
  ledgerId: string
): Promise<
  | { userId: string; ledger: typeof ledgers.$inferSelect; error?: never }
  | { userId?: never; ledger?: never; error: NextResponse }
> {
  const result = await verifyLedgerOwnership(ledgerId);

  if (result.error) {
    return result;
  }

  return {
    userId: result.ledger.userId,
    ledger: result.ledger,
  };
}
