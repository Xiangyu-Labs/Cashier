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
            if (!token.jti) {
                token.jti = crypto.randomUUID();
            }

            const userId = token.sub;
            const sessionId = token.jti;

            if (userId && sessionId) {
                try {
                    // 3. Persist/Update Session in DB

                    if (trigger === "signIn") {
                        // Create new session record strictly on sign-in
                        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

                        // We do not capture headers here to avoid Edge/Runtime issues.
                        // Device info will be updated by a separate client-side call or middleware if needed.
                        await db.insert(sessions).values({
                            sessionToken: sessionId,
                            userId: userId,
                            expires: expires,
                            lastActiveAt: new Date(),
                            userAgent: null,
                            ipAddress: null,
                        });
                    } else {
                        // For other triggers: Update lastActiveAt if session exists.
                        // We DO NOT auto-create sessions here.

                        const existingSession = await db.query.sessions.findFirst({
                            where: eq(sessions.sessionToken, sessionId),
                            columns: { sessionToken: true, lastActiveAt: true },
                        });

                        if (existingSession) {
                            // Throttled Update: active touch every 1 hour
                            const now = new Date();
                            const lastActive = existingSession.lastActiveAt ? new Date(existingSession.lastActiveAt).getTime() : 0;
                            if (now.getTime() - lastActive > 60 * 60 * 1000) {
                                await db.update(sessions)
                                    .set({ lastActiveAt: now })
                                    .where(eq(sessions.sessionToken, sessionId));
                            }
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
