
import type { NextAuthConfig } from "next-auth";

// Notice this is only an object, not a full NextAuth instance
export const authConfig = {
    pages: {
        signIn: "/login",
        verifyRequest: "/login/verify",
        error: "/login/error",
    },
    callbacks: {
        async signIn({ user, isNewUser }) {
            // Check for disabled registration
            if (isNewUser && process.env.DISABLE_REGISTRATION === "true") {
                return false;
            }
            return true;
        },
        async session({ session, user }) {
            // Add user ID to the session
            if (session.user) {
                session.user.id = user.id;
            }
            return session;
        },
        authorized({ auth, request: { nextUrl } }) {
            // We can move the middleware logic here if we wanted to simplify middleware.ts
            // But we already have custom logic in middleware.ts, so we'll keep this simple or true.
            return true;
        },
    },
    providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig;
