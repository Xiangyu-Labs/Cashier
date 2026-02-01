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
import { eq, and, isNull } from "drizzle-orm";

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
                    where: and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)),
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
        // JWT Callback: The core of our session management
        async jwt({ token, user, trigger, account, session }) {
            // 1. Initial Sign In
            if (user) {
                token.id = user.id;
                token.sub = user.id;
            }

            // 2. Ensuring we have a JTI (Session ID)
            // NextAuth usually adds 'jti' by default. We use it as our sessionToken.
            if (!token.jti) {
                const { v4: uuidv4 } = await import("uuid");
                token.jti = uuidv4();
            }

            const userId = token.sub;
            const sessionId = token.jti;

            if (userId && sessionId) {
                // 3. Persist/Update Session in DB
                // We do this in JWT callback because it runs on every rotation/visit (if updated)
                // To avoid DB spam, we can throttle updates, but for security (revocation check),
                // we should at least ensure it EXISTS.

                // Note: We cannot easily use `headers()` inside `jwt` callback in all edge cases,
                // but usually it works in Next.js Server Components / Actions.
                // We'll try to capture device info if possible, or leave it merely as ID tracking.

                try {
                    // Check if session exists
                    const existingSession = await db.query.sessions.findFirst({
                        where: eq(sessions.sessionToken, sessionId),
                        columns: { sessionToken: true, lastActiveAt: true },
                    });

                    const now = new Date();

                    if (!existingSession) {
                        // Create new session record
                        // We try to get UA/IP if possible (best effort)
                        /* Note: Getting headers in JWT callback is tricky in some NextAuth versions.
                           Ideally we do this in a separate server action or middleware, 
                           but doing it here ensures the "Token" implies "DB Record".
                        */
                        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

                        // Heuristically try to get headers if we are in a context that supports it
                        // In NextAuth v5 (beta), we might not have direct access to headers() here easily.
                        // We will insert basic info and let a `touchSession` logic update UA later if needed.
                        await db.insert(sessions).values({
                            sessionToken: sessionId,
                            userId: userId,
                            expires: expires,
                            lastActiveAt: now,
                        });
                    } else {
                        // Throttled Update: active touch every 1 hour
                        const lastActive = existingSession.lastActiveAt ? new Date(existingSession.lastActiveAt).getTime() : 0;
                        if (Date.now() - lastActive > 60 * 60 * 1000) {
                            await db.update(sessions)
                                .set({ lastActiveAt: now })
                                .where(eq(sessions.sessionToken, sessionId));
                        }
                    }
                } catch (error) {
                    console.error("Failed to sync session with DB:", error);
                }
            }

            return token;
        },
        async session({ session, token }) {
            // Override the default session callback to check DB existence (Security barrier)
            if (token.sub && session.user) {
                const userId = token.sub;
                const sessionId = token.jti as string;

                // 1. Verify Session Validity (Revocation Check)
                const dbSession = await db.query.sessions.findFirst({
                    where: eq(sessions.sessionToken, sessionId),
                    columns: { sessionToken: true }
                });

                if (!dbSession) {
                    // Session was revoked (deleted) from DB
                    return null as any;
                }

                // 2. Fetch User Data
                const dbUser = await db.query.users.findFirst({
                    where: and(eq(users.id, userId), isNull(users.deletedAt)),
                    columns: { id: true, email: true, name: true, image: true, defaultLedgerId: true }
                });

                if (!dbUser) {
                    return null as any;
                }

                // 3. Populate Session Object
                session.user.id = dbUser.id;
                session.user.email = dbUser.email;
                session.user.name = dbUser.name;
                session.user.image = dbUser.image;
                session.user.defaultLedgerId = dbUser.defaultLedgerId ?? undefined;

                // Expose sessionId to client/server-actions for identification
                (session as any).sessionId = sessionId;

                // 4. (Optional) Update UA/IP asynchronously here if we have request context?
                // `session` callback receives `request` in some versions, but standard is (session, token).
                // We'll rely on the initial creation or separate mechanics for IP tracking.
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
