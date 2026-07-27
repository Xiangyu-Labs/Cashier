import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authenticateWithOTP } from "@/modules/auth/application/use-cases/authenticate-with-otp";
import { authenticateWithPassword } from "@/modules/auth/application/use-cases/authenticate-with-password";
import { authenticateDevUser } from "@/modules/auth/application/use-cases/authenticate-dev-user";
import { handleAuthUserCreated } from "@/modules/auth/application/use-cases/handle-auth-user-created";
import { handleAuthUserSignedIn } from "@/modules/auth/application/use-cases/handle-auth-user-signed-in";
import { isAuthSignInAllowed } from "@/modules/auth/application/use-cases/is-auth-sign-in-allowed";
import { getSessionUser } from "@/modules/auth/application/queries/get-session-user";
import { isDevAuthBypassEnabled } from "@/modules/auth/dev-auth";
import { TIME_SECONDS } from "@/lib/constants";
import { runtimeEnv } from "@/lib/env/runtime";

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

      return authenticateWithOTP({
        email: credentials.email,
        otp: credentials.otp,
        locale: typeof credentials.locale === "string" ? credentials.locale : "zh",
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
      if (typeof credentials?.email !== "string" || typeof credentials.password !== "string") {
        return null;
      }
      return authenticateWithPassword({ email: credentials.email, password: credentials.password });
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
        return authenticateDevUser({
          locale: typeof credentials?.locale === "string" ? credentials.locale : "zh-CN",
        });
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
            hasPassword: dbUser.passwordHash != null,
            passwordUpdatedAt: dbUser.passwordUpdatedAt?.toISOString() ?? null,
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
    };
  }

  interface User {
    locale?: string | null;
  }
}
