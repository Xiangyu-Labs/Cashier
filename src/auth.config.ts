import type { NextAuthConfig } from "next-auth";

// Notice this is only an object, not a full NextAuth instance
export const authConfig = {
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
    error: "/login/error",
  },
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, user }) {
      if (user != null && user.id != null && user.id !== "") {
        token.id = user.id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user != null && token.id != null) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized() {
      // We can move the proxy logic here if we want to simplify src/proxy.ts.
      // The current request handling stays in src/proxy.ts, so this remains permissive.
      return true;
    },
  },
  providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig;
