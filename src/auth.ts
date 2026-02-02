import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
    users,
    accounts,
    verificationTokens,
} from "@/features/auth/server/schema";
import { eq, and, isNull } from "drizzle-orm";

import { authConfig } from "./auth.config";
import { verifyOTPToken, deleteOTPToken } from "@/features/auth/server/repositories/otp-repository";

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        verificationTokensTable: verificationTokens,
    }),
    providers: [
        Credentials({
            id: "otp",
            name: "OTP",
            credentials: {
                email: { type: "email" },
                otp: { type: "text" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.otp) {
                    return null;
                }

                const email = credentials.email as string;
                const otp = credentials.otp as string;

                // Verify OTP (defense in depth - already verified in API)
                const result = await verifyOTPToken(email, otp);
                if (!result.success) {
                    return null;
                }

                // Check registration whitelist
                const { isRegistrationAllowed } = await import("@/features/auth/server/services/registration");
                if (!(await isRegistrationAllowed(email))) {
                    return null;
                }

                // Get or create user
                let user = await db.query.users.findFirst({
                    where: and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)),
                });

                if (!user) {
                    const [newUser] = await db.insert(users).values({
                        email: email.toLowerCase(),
                        emailVerified: new Date(),
                    }).returning();
                    user = newUser;

                    // Create default ledger for new user
                    const { createDefaultLedgerForUser } = await import("@/features/auth/server/services/user-setup");
                    await createDefaultLedgerForUser(user.id, user.email || "New User");
                }

                // Delete the used OTP (one-time use)
                await deleteOTPToken(email);

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                };
            },
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        updateAge: 24 * 60 * 60, // Refresh daily
    },
    pages: {
        signIn: "/login",
        error: "/login/error",
    },
    events: {
        async createUser({ user }) {
            // When a new user is created, auto-create their default ledger
            if (user.id) {
                const { createDefaultLedgerForUser } = await import(
                    "@/features/auth/server/services/user-setup"
                );
                await createDefaultLedgerForUser(user.id, user.email || "New User");
            }
        },
        async signIn({ user, isNewUser }) {
            // Send login notification for existing users (not on first sign up)
            if (!isNewUser && user.email) {
                const { sendLoginNotification } = await import(
                    "@/features/auth/server/services/notifications"
                );
                await sendLoginNotification(user.email);
            }
        },
    },
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ user }) {
            if (user.email) {
                const { isRegistrationAllowed } = await import("@/features/auth/server/services/registration");
                if (!(await isRegistrationAllowed(user.email))) {
                    return false;
                }
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.sub = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (token.sub && session.user) {
                const userId = token.sub;

                // Fetch User Data from DB to ensure it's up to date and user still exists
                const dbUser = await db.query.users.findFirst({
                    where: and(eq(users.id, userId), isNull(users.deletedAt)),
                    columns: { id: true, email: true, name: true, image: true, defaultLedgerId: true }
                });

                if (!dbUser) {
                    return null as any;
                }

                session.user.id = dbUser.id;
                session.user.email = dbUser.email;
                session.user.name = dbUser.name;
                session.user.image = dbUser.image;
                session.user.defaultLedgerId = dbUser.defaultLedgerId ?? undefined;
            }
            return session;
        },
    },
});

// Type augmentation for session
declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            defaultLedgerId?: string | null;
        };
    }
}
