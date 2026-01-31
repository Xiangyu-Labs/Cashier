
import type { NextAuthConfig } from "next-auth";

// Notice this is only an object, not a full NextAuth instance
export const authConfig = {
    pages: {
        signIn: "/login",
        verifyRequest: "/login/verify",
        error: "/login/error",
    },
    callbacks: {
        async signIn() {
            return true;
        },
        async jwt({ token, user }) {
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
        authorized() {
            // We can move the middleware logic here if we wanted to simplify middleware.ts
            // But we already have custom logic in middleware.ts, so we'll keep this simple or true.
            return true;
        },
    },
    providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig;
