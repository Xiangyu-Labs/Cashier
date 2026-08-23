import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { RECENT_AUTH_MAX_AGE_SECONDS } from "@/lib/auth-constants";

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

export async function requireRecentAuth(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  const authenticatedAt = session?.user?.authenticatedAt;
  const authenticatedAtMs =
    typeof authenticatedAt === "string" ? Date.parse(authenticatedAt) : Number.NaN;
  const now = Date.now();
  if (
    userId == null ||
    userId === "" ||
    !Number.isFinite(authenticatedAtMs) ||
    authenticatedAtMs > now ||
    now - authenticatedAtMs > RECENT_AUTH_MAX_AGE_SECONDS * 1000
  ) {
    throw new AppError("Recent authentication required", "REAUTHENTICATION_REQUIRED", 401);
  }
  return userId;
}
