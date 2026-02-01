import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
    users,
    accounts,
    sessions,
    verificationTokens,
} from "@/features/auth/server/schema";
import { eq } from "drizzle-orm";

import { authConfig } from "./auth.config";
import crypto from "crypto";
import { verifyOTPToken, deleteOTPToken } from "@/features/auth/server/repositories/otp-repository";

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    // Note: We use JWT strategy for authentication, but still use DrizzleAdapter
    // for managing users, accounts, and verification tokens.
    // The sessionsTable is NOT used by NextAuth in JWT mode, but we manually
    // maintain it for device management and audit purposes (see events.signIn below)
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions, // Not used by NextAuth in JWT mode
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
                    where: eq(users.email, email.toLowerCase()),
                });

                let isNewUser = false;
                if (!user) {
                    const [newUser] = await db.insert(users).values({
                        email: email.toLowerCase(),
                        emailVerified: new Date(),
                    }).returning();
                    user = newUser;
                    isNewUser = true;

                    // Create default ledger for new user
                    // (since Credentials provider doesn't trigger createUser event)
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
        async session({ session, token }) {
            // Override the default session callback to check DB existence
            if (token.sub && session.user) {
                const userId = token.sub; // 'sub' is the standard claim for user ID in JWT

                const dbUser = await db.query.users.findFirst({
                    where: eq(users.id, userId),
                    columns: { id: true, email: true, name: true, image: true, defaultLedgerId: true }
                });

                if (!dbUser) {
                    // User not found in DB (stale session), invalidate it
                    // Returning null informs NextAuth that the session is invalid
                    return null as any;
                }

                // Sync latest user data
                session.user.id = dbUser.id;
                session.user.email = dbUser.email;
                session.user.name = dbUser.name;
                session.user.image = dbUser.image;
                session.user.defaultLedgerId = dbUser.defaultLedgerId ?? undefined;
            }
            return session;
        },
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

            // Create session record for device management and audit
            // Note: In JWT mode, NextAuth doesn't create session records automatically
            // We manually create them here for device tracking purposes
            if (user.id) {
                try {
                    const sessionToken = crypto.randomBytes(32).toString("hex");
                    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

                    await db.insert(sessions).values({
                        sessionToken,
                        userId: user.id,
                        expires,
                        // Device info will be filled by touchSession() when user accesses the app
                    });
                } catch (error) {
                    // Log error but don't fail the sign-in process
                    console.error("Failed to create session record for device tracking:", error);
                }
            }
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
