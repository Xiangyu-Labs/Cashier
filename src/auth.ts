import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
    users,
    accounts,
    sessions,
    verificationTokens,
} from "@/lib/db/schema";

import MagicLinkEmail from "@/emails/magic-link";
import { Resend as ResendClient } from "resend";
import { authConfig } from "./auth.config";
import crypto from "crypto";

const resendClient = new ResendClient(process.env.AUTH_RESEND_KEY);

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
        Resend({
            apiKey: process.env.AUTH_RESEND_KEY,
            from: process.env.AUTH_EMAIL_FROM || "noreply@example.com",
            maxAge: parseInt(process.env.MAGIC_LINK_EXPIRES_SECONDS || "900"), // 15 min default
            sendVerificationRequest: async ({ identifier: email, url, provider }) => {
                const { host } = new URL(url);
                try {
                    await resendClient.emails.send({
                        from: provider.from || process.env.AUTH_EMAIL_FROM || "noreply@example.com",
                        to: email,
                        subject: `Sign in to ${host}`,
                        react: MagicLinkEmail({ url, host }) as React.ReactElement,
                    });
                } catch (error) {
                    console.error("Failed to send verification email", error);
                    throw new Error("Failed to send verification email");
                }
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
        verifyRequest: "/login/verify",
        error: "/login/error",
    },
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ user }) {
            if (user.email) {
                const { isRegistrationAllowed } = await import("@/lib/auth/registration");
                if (!(await isRegistrationAllowed(user.email))) {
                    return false;
                }
            }
            return true;
        },
    },
    events: {
        async createUser({ user }) {
            // When a new user is created, auto-create their default ledger
            if (user.id) {
                const { createDefaultLedgerForUser } = await import(
                    "@/lib/auth/user-setup"
                );
                await createDefaultLedgerForUser(user.id, user.email || "New User");
            }
        },
        async signIn({ user, isNewUser }) {
            // Send login notification for existing users (not on first sign up)
            if (!isNewUser && user.email) {
                const { sendLoginNotification } = await import(
                    "@/lib/auth/notifications"
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
        };
    }
}
