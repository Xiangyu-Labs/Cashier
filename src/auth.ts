import NextAuth, { type NextAuthConfig } from "next-auth";
import { CredentialsSignin } from "@auth/core/errors";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authenticateWithOTP } from "@/modules/auth/application/use-cases/authenticate-with-otp";
import { authenticateWithPassword } from "@/modules/auth/application/use-cases/authenticate-with-password";
import { authenticateDevUser } from "@/modules/auth/application/use-cases/authenticate-dev-user";
import { handleAuthUserSignedIn } from "@/modules/auth/application/use-cases/handle-auth-user-signed-in";
import { isAuthSignInAllowed } from "@/modules/auth/application/use-cases/is-auth-sign-in-allowed";
import { getSessionUser } from "@/modules/auth/application/queries/get-session-user";
import { isDevAuthBypassEnabled } from "@/modules/auth/dev-auth";
import { TIME_SECONDS } from "@/lib/constants";
import { runtimeEnv } from "@/lib/env/runtime";
import { serverComposition } from "@/application/server-composition-root";
import { completeInteractiveSignIn } from "@/application/use-cases/complete-interactive-sign-in";
import { AuthSignInError } from "@/modules/auth/errors";
import type { AuthenticatedPrincipal } from "@/modules/auth/contracts";

class AuthCredentialsSigninError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

async function completeSignIn(principal: AuthenticatedPrincipal) {
  return completeInteractiveSignIn(principal, {
    ledgers: serverComposition.ledgers,
    otpTokens: serverComposition.otpTokens,
  });
}

async function authorizeInteractiveSignIn(
  authenticate: () => Promise<AuthenticatedPrincipal | null>
) {
  try {
    const principal = await authenticate();
    if (principal == null) return null;
    return await completeSignIn(principal);
  } catch (error) {
    if (error instanceof AuthSignInError) {
      throw new AuthCredentialsSigninError(error.code);
    }
    throw error;
  }
}

const providers: NextAuthConfig["providers"] = [
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
        credentials.email === "" ||
        credentials?.otp == null ||
        credentials.otp === ""
      ) {
        return null;
      }

      if (typeof credentials.email !== "string" || typeof credentials.otp !== "string") {
        return null;
      }
      const email = credentials.email;
      const otp = credentials.otp;

      return authorizeInteractiveSignIn(() =>
        authenticateWithOTP(
          {
            email,
            otp,
            locale: typeof credentials.locale === "string" ? credentials.locale : "zh",
            requestHeaders: request.headers,
          },
          {
            userAccounts: serverComposition.userAccounts,
            otpTokens: serverComposition.otpTokens,
            rateLimiter: serverComposition.rateLimiter,
          }
        )
      );
    },
  }),
  Credentials({
    id: "password",
    name: "Password",
    credentials: {
      email: { type: "email" },
      password: { type: "password" },
    },
    async authorize(credentials, request) {
      if (typeof credentials?.email !== "string" || typeof credentials.password !== "string") {
        return null;
      }
      const email = credentials.email;
      const password = credentials.password;
      return authorizeInteractiveSignIn(() =>
        authenticateWithPassword(
          {
            email,
            password,
            requestHeaders: request.headers,
          },
          {
            users: serverComposition.userAccounts,
            rateLimiter: serverComposition.rateLimiter,
          }
        )
      );
    },
  }),
];

if (isDevAuthBypassEnabled()) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Development",
      credentials: {
        locale: { type: "text" },
      },
      async authorize(credentials) {
        return authorizeInteractiveSignIn(() =>
          authenticateDevUser(
            {
              locale: typeof credentials?.locale === "string" ? credentials.locale : "zh-CN",
            },
            { users: serverComposition.userAccounts }
          )
        );
      },
    })
  );
}

export const authOptions = {
  ...authConfig,
  providers,
  session: {
    strategy: "jwt",
    maxAge: runtimeEnv.sessionMaxAgeDays * TIME_SECONDS.DAY,
    updateAge: TIME_SECONDS.DAY,
  },
  pages: authConfig.pages,
  events: {
    async signIn({ user, isNewUser }) {
      await handleAuthUserSignedIn(
        {
          ...(user.email != null ? { email: user.email } : {}),
          ...(typeof user.locale === "string" ? { locale: user.locale } : {}),
          ...(isNewUser != null ? { isNewUser } : {}),
        },
        { emailDelivery: serverComposition.email }
      );
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      return isAuthSignInAllowed(
        user.email != null ? { email: user.email } : {},
        serverComposition.userAccounts
      );
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
        const dbUser = await getSessionUser(token.sub, serverComposition.userAccounts);

        return {
          ...session,
          user: {
            ...session.user,
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
            hasPassword: dbUser.passwordHash != null,
            passwordUpdatedAt: dbUser.passwordUpdatedAt?.toISOString() ?? null,
            interfaceLanguage: dbUser.interfaceLanguage,
          },
        };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      hasPassword: boolean;
      passwordUpdatedAt: string | null;
      interfaceLanguage: "auto" | "zh" | "en";
    };
  }

  interface User {
    locale?: string | null;
  }
}
