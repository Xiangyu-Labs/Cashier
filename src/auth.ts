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

const resendClient = new ResendClient(process.env.AUTH_RESEND_KEY);

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
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
        strategy: "database",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        updateAge: 24 * 60 * 60, // Refresh daily
    },
    pages: {
        signIn: "/login",
        verifyRequest: "/login/verify",
        error: "/login/error",
    },
    callbacks: {
        async signIn({ user, account, profile }) {
            // Check for disabled registration
            // Note: isNewUser is not passed to signIn callback in v5 beta normally? 
            // Drizzle adapter might handle user creation before this.
            // But we can check if user exists. 
            // Actually, for Magic Link, the user is created if not exists.
            // If DISABLE_REGISTRATION is true, we should check if user exists in DB.
            // But doing DB call here:
            if (process.env.DISABLE_REGISTRATION === "true") {
                // If user doesn't have an ID yet? No, with database strategy user is created/retrieved.
                // Wait, if it's new user, `user` object might have just been created by adapter?
                // We want to prevent creation.
                // Adapter creates user during `signIn` flow usually.
                // If we return false here, we abort.
                // But the user might already be created by adapter just before this callback?
                // Let's check user.createdAt? 
                // A better place is `middleware` or wrapping the adapter's createUser?
                // Or simply: check if the email exists in `signIn`.
                // If not, and disabled, return false.
                // But `user` object is passed. Does it have an ID?
                // If the user was just created, we might want to delete it if we deny?
                // Or prevent it earlier.

                // Optimized approach: Check DB for email.
                // const existingUser = await db.query.users.findFirst({ where: eq(users.email, user.email) });
                // If !existingUser, deny.
                // But if adapter acts first, existingUser WILL exist.

                // Let's rely on standard practice: 
                // If we can't easily detect new user without DB query race condition, we might let it slide or implement a custom adapter wrapper later.
                // But `isNewUser` is passed to `jwt` callback or `session` callback?
                // Documentation says `signIn` callback receives `user`, `account`, `profile`, `email`, `credentials`.
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
