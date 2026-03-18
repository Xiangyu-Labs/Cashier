import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/errors";
import { requireLedgerAccess } from "@/modules/auth";

/**
 * Wraps a server action to automatically handle authentication.
 * Injects userId as the first argument to the action.
 *
 * Usage:
 *   const myAction = withAuth(async (userId, data: MyInputType) => {
 *     // userId is guaranteed to be string
 *     return doSomething(userId, data);
 *   });
 */
export function withAuth<TArgs extends unknown[], TReturn>(
  action: (userId: string, ...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    const session = await auth();

    if (session?.user?.id == null) {
      throw new UnauthorizedError("Please log in to perform this action");
    }

    return action(session.user.id, ...args);
  };
}

/**
 * Gets the current authenticated user ID or throws UnauthorizedError.
 * Use this when you need the userId but don't want to wrap the whole action.
 */
export async function requireAuth(): Promise<string> {
  const session = await auth();

  if (session?.user?.id == null) {
    throw new UnauthorizedError("Please log in to perform this action");
  }

  return session.user.id;
}

/**
 * Wraps a server action to automatically handle ledger access verification.
 * The wrapped action must have ledgerId as its first argument.
 *
 * Usage:
 *   const myAction = withLedgerAccess(async (ledgerId: string, data: MyInputType) => {
 *     // ledger access is guaranteed, ledgerId is validated
 *     return doSomething(ledgerId, data);
 *   });
 */
export function withLedgerAccess<TArgs extends unknown[], TReturn>(
  action: (ledgerId: string, ...args: TArgs) => Promise<TReturn>
): (ledgerId: string, ...args: TArgs) => Promise<TReturn> {
  return async (ledgerId: string, ...args: TArgs) => {
    await requireLedgerAccess(ledgerId);
    return action(ledgerId, ...args);
  };
}
