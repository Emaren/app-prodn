// lib/authOptions.js
// import SteamProvider from "next-auth/providers/steam"; // Uncomment if using

export const authOptions = {
    providers: [
      // SteamProvider({
      //   clientId: process.env.STEAM_API_KEY,
      //   clientSecret: process.env.STEAM_API_SECRET,
      //   callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback/steam`,
      // }),
    ],
    pages: {
      signIn: "/login",
    },
    callbacks: {
      async session({ session, token }) {
        session.user.steamId = token.sub;
        return session;
      },
    },
  };
  