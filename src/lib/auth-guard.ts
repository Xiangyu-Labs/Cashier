import { auth, signOut } from "@/auth";
//

/**
 * Enforces authentication for Server Components.
 * If the session is invalid (e.g. user deleted from DB but cookie exists),
 * it actively clears the session cookies to prevent redirect loops.
 */
export async function requireAuth() {
    const session = await auth();

    if (!session?.user?.id) {
        // Breaking the "Redirect Loop":
        // Middleware passes the request because the Cookie signature is valid.
        // But Server (DB) validation failed (user deleted/reset).
        // specific 'redirectTo' ensures we go to login after clearing cookies.
        await signOut({ redirectTo: "/login" });
    }

    // Return session if valid, satisfying TypeScript
    return session!;
}
