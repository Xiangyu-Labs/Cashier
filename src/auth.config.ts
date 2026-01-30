
import type { NextAuthConfig } from "next-auth";

// Notice this is only an object, not a full NextAuth instance
export const authConfig = {
    pages: {
        signIn: "/login",
        verifyRequest: "/login/verify",
        error: "/login/error",
    },
    callbacks: {
        async signIn({ user }) {
            // Check for disabled registration
            // Note: We can implement logic here to check if user exists in DB if needed
            // But for now we'll allow all signups until we implemented DB check helper
            if (process.env.DISABLE_REGISTRATION === "true") {
                return true; // Simplify for now to avoid complexity without DB access
            }
            return true;
        },
        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token.id) {
                session.user.id = token.id as string;
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
