import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Checks if a user is allowed to register/sign-in based on the system configuration.
 *
 * @param email The email address of the user attempting to sign in
 * @returns true if allowed, false if denied
 */
export async function isRegistrationAllowed(email: string): Promise<boolean> {
    // If registration is not disabled, allow everyone
    if (process.env.DISABLE_REGISTRATION !== "true") {
        return true;
    }

    // If registration is disabled, check if user already exists
    const user = await db.query.users.findFirst({
        where: eq(users.email, email),
    });

    return !!user;
}
