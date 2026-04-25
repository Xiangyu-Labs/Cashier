import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers/index";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts } from "@/persistence/schema/auth";
import { authConfig } from "./auth.config";
import {
  authenticateWithOTP,
  authenticateWithPassword,
  handleAuthUserCreated,
  handleAuthUserSignedIn,
  isAuthSignInAllowed,
} from "@/modules/auth/use-cases";
import { getSessionUser } from "@/modules/auth/queries";
import { TIME_SECONDS } from "@/lib/constants";
import { runtimeEnv } from "@/lib/env/runtime";
import { publicEnv } from "@/lib/env/public";

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
  const issuer = runtimeEnv.oidcIssuer;
  const clientId = runtimeEnv.oidcClientId;
  const clientSecret = runtimeEnv.oidcClientSecret;

  // Only configure if all env vars are present
  if (
    issuer == null ||
    issuer === "" ||
    clientId == null ||
    clientId === "" ||
    clientSecret == null ||
    clientSecret === ""
  ) {
    return null;
  }

  // Build explicit redirect_uri to ensure consistency with IdP configuration
  // Falls back to NEXT_PUBLIC_APP_URL if AUTH_URL is not set
  const baseUrl = runtimeEnv.authUrl ?? publicEnv.appUrl;
  const redirectUri =
    baseUrl != null && baseUrl !== ""
      ? `${baseUrl.replace(/\/$/, "")}/api/auth/callback/oidc`
      : undefined;

  return {
    id: "oidc",
    name: publicEnv.oidcButtonName,
    type: "oidc",
    issuer,
    wellKnown: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    // Explicitly set redirect_uri to ensure it matches IdP configuration
    ...(redirectUri != null && redirectUri !== "" ? { redirect_uri: redirectUri } : {}),
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
        email: profile.email ?? null,
        image: profile.picture ?? null,
      };
    },
  };
})();

export const authOptions = {
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
      async authorize(credentials, request) {
        if (
          credentials?.email == null ||
          credentials?.email === "" ||
          credentials?.otp == null ||
          credentials?.otp === ""
        ) {
          return null;
        }

        // Type guard: ensure credentials are strings before using
        if (typeof credentials.email !== "string" || typeof credentials.otp !== "string") {
          return null;
        }

        const email = credentials.email;
        const otp = credentials.otp;
        const locale = typeof credentials.locale === "string" ? credentials.locale : "zh";

        return authenticateWithOTP({
          email,
          otp,
          locale,
          requestHeaders: request.headers,
        });
      },
    }),
    Credentials({
      id: "password",
      name: "Password",
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        if (
          credentials?.email == null ||
          credentials?.email === "" ||
          credentials?.password == null ||
          credentials?.password === ""
        ) {
          return null;
        }

        if (typeof credentials.email !== "string" || typeof credentials.password !== "string") {
          return null;
        }

        return authenticateWithPassword({
          email: credentials.email,
          password: credentials.password,
        });
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: runtimeEnv.sessionMaxAgeDays * TIME_SECONDS.DAY,
    updateAge: TIME_SECONDS.DAY, // Refresh daily
  },
  pages: authConfig.pages,
  events: {
    async createUser({ user }) {
      await handleAuthUserCreated(user.id != null ? { userId: user.id } : {});
    },
    async signIn({ user, isNewUser }) {
      await handleAuthUserSignedIn({
        ...(user.id != null ? { userId: user.id } : {}),
        ...(user.email != null ? { email: user.email } : {}),
        ...(typeof user.locale === "string" ? { locale: user.locale } : {}),
        ...(isNewUser != null ? { isNewUser } : {}),
      });
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      return isAuthSignInAllowed(user.email != null ? { email: user.email } : {});
    },
    async jwt({ token, user }) {
      if (user != null && user.id != null && user.id !== "") {
        token.id = user.id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub != null && token.sub !== "" && session.user != null) {
        const dbUser = await getSessionUser(token.sub);

        return {
          ...session,
          user: {
            ...session.user,
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
          },
        };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);

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

  interface User {
    locale?: string | null;
  }
}
