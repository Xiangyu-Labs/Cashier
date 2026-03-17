import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers/index";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts } from "@/features/auth/server/schema";
import { eq, and, isNull } from "drizzle-orm";

import { authConfig } from "./auth.config";
import { deleteOTPToken } from "@/features/auth/server/repositories/otp-repository";
import {
  findOTPRecord,
  verifyOTPWithPolicy,
} from "@/features/auth/server/services/otp-verification";
import { TIME_SECONDS } from "@/lib/constants";
import { UnauthorizedError } from "@/lib/errors";

// ==========================================
// Generic OIDC/OAuth Provider (Authelia, Keycloak, etc.)
// ==========================================
interface OIDCProfile {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  picture?: string;
}

const OIDCProvider = ((): OAuthConfig<OIDCProfile> | null => {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;

  // Only configure if all env vars are present
  if (!issuer || !clientId || !clientSecret) {
    return null;
  }

  // Build explicit redirect_uri to ensure consistency with IdP configuration
  // Falls back to NEXT_PUBLIC_APP_URL if AUTH_URL is not set
  const baseUrl = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  const redirectUri = baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/auth/callback/oidc` : undefined;

  return {
    id: "oidc",
    name: process.env.OIDC_BUTTON_NAME || "SSO",
    type: "oidc",
    issuer,
    wellKnown: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    // Explicitly set redirect_uri to ensure it matches IdP configuration
    ...(redirectUri && { redirect_uri: redirectUri }),
    checks: ["pkce", "state"],
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    // Force Auth.js to call userinfo endpoint instead of relying only on id_token
    // Authelia returns complete user info (including email) from userinfo, not in id_token
    idToken: false,
    // SECURITY: Disabled to prevent account takeover attacks
    // Users must manually link accounts after authentication
    allowDangerousEmailAccountLinking: false,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.preferred_username ?? null,
        email: profile.email,
        image: profile.picture ?? null,
      };
    },
  };
})();

// Inline helper: Check if registration is allowed (simplified architecture)
async function isRegistrationAllowed(email: string): Promise<boolean> {
  if (process.env.DISABLE_REGISTRATION !== "true") {
    return true;
  }
  // Normalize email to lowercase for consistent lookup
  const normalizedEmail = email.toLowerCase();
  const user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  });
  return !!user;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
  }),
  providers: [
    ...(OIDCProvider ? [OIDCProvider] : []),
    Credentials({
      id: "otp",
      name: "OTP",
      credentials: {
        email: { type: "email" },
        otp: { type: "text" },
        locale: { type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) {
          return null;
        }

        // Type guard: ensure credentials are strings before using
        if (typeof credentials.email !== "string" || typeof credentials.otp !== "string") {
          return null;
        }

        const email = credentials.email;
        const otp = credentials.otp;
        const locale = typeof credentials.locale === "string" ? credentials.locale : "zh";

        // Verify OTP (defense in depth - already verified in API)
        const record = await findOTPRecord(email);
        if (!record) {
          return null;
        }
        const result = await verifyOTPWithPolicy(email, otp, record);
        if (!result.success) {
          return null;
        }

        // Check registration whitelist
        if (!(await isRegistrationAllowed(email))) {
          return null;
        }

        // Get or create user
        let user = await db.query.users.findFirst({
          where: and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)),
        });

        // Track if this is an existing user (for login notification)
        const isExistingUser = !!user;

        if (!user) {
          const [newUser] = await db
            .insert(users)
            .values({
              email: email.toLowerCase(),
              emailVerified: new Date(),
            })
            .returning();
          user = newUser;

          // Create default ledger for new user
          const { createDefaultLedgerForUser } =
            await import("@/features/auth/server/services/user-setup");
          await createDefaultLedgerForUser(user.id, user.email || "New User", locale);
        }

        // Delete the used OTP (one-time use)
        await deleteOTPToken(email);

        // Send login notification for existing users
        if (isExistingUser && user.email) {
          const { sendLoginNotification } =
            await import("@/features/auth/server/services/notifications");
          await sendLoginNotification(user.email);
        }

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
    maxAge: TIME_SECONDS.MONTH, // 30 days
    updateAge: TIME_SECONDS.DAY, // Refresh daily
  },
  pages: {
    signIn: "/login",
    error: "/login/error",
  },
  events: {
    async createUser({ user }) {
      // When a new user is created, auto-create their default ledger
      if (user.id) {
        const { createDefaultLedgerForUser } =
          await import("@/features/auth/server/services/user-setup");
        await createDefaultLedgerForUser(user.id, user.email || "New User");
      }
    },
    async signIn({ user, isNewUser }) {
      // Send login notification for existing users (not on first sign up)
      if (!isNewUser && user.email) {
        const { sendLoginNotification } =
          await import("@/features/auth/server/services/notifications");
        await sendLoginNotification(user.email);
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (user.email) {
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
          columns: { id: true, email: true, name: true, image: true, defaultLedgerId: true },
        });

        if (!dbUser) {
          throw new UnauthorizedError("User not found in database");
        }

        return {
          ...session,
          user: {
            ...session.user,
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
            defaultLedgerId: dbUser.defaultLedgerId ?? undefined,
          },
        };
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
