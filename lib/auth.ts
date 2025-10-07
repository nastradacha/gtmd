// lib/auth.ts
import { type NextAuthOptions, getServerSession } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: { params: { scope: "read:user repo project" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        // attach GitHub user token to JWT
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // surface the token to server actions / routes via session
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
};

// Helper to fetch the server session in routes/server components
export const auth = () => getServerSession(authOptions);
