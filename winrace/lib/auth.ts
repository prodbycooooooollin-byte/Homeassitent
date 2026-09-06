import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import TwitchProvider from "next-auth/providers/twitch";
import { prisma } from "@/lib/prisma";
import { verifySecret } from "@/lib/codes";

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    id: "credentials",
    name: "E-Mail & Passwort",
    credentials: {
      email: { label: "E-Mail", type: "email" },
      password: { label: "Passwort", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) return null;
      const email = credentials.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return null;

      const valid = await verifySecret(credentials.password, user.passwordHash);
      if (!valid) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.displayName,
        image: user.avatarUrl ?? undefined,
      };
    },
  }),
];

const twitchLoginEnabled = Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
if (twitchLoginEnabled) {
  providers.push(
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
    })
  );
}

export const isTwitchLoginEnabled = twitchLoginEnabled;

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Kein next-auth-Adapter im Einsatz (siehe Kommentar unten) – bei einem
    // Twitch-Login übernehmen wir die Nutzer-Anlage/-Verknüpfung hier
    // manuell und schreiben die *eigene* User-ID in `user.id`, damit der
    // jwt()-Callback sie übernimmt.
    async signIn({ user, account, profile }) {
      if (account?.provider !== "twitch") return true;

      const twitchUserId = account.providerAccountId;
      if (!twitchUserId) return false;

      const p = profile as Record<string, unknown> | null;
      const displayName =
        (user.name as string | undefined) ??
        (p?.preferred_username as string | undefined) ??
        (p?.display_name as string | undefined) ??
        "Twitch-Streamer";
      const twitchLogin =
        (p?.preferred_username as string | undefined) ?? (p?.login as string | undefined) ?? displayName.toLowerCase();
      const email = (user.email as string | undefined) ?? (p?.email as string | undefined) ?? `twitch-${twitchUserId}@accounts.winrace.local`;
      const avatarUrl = (user.image as string | undefined) ?? (p?.profile_image_url as string | undefined) ?? null;

      const existingConnection = await prisma.twitchConnection.findFirst({ where: { twitchUserId } });

      let dbUserId: string;
      if (existingConnection) {
        await prisma.user.update({ where: { id: existingConnection.userId }, data: { avatarUrl } });
        await prisma.twitchConnection.update({
          where: { id: existingConnection.id },
          data: { twitchLogin, verified: true },
        });
        dbUserId = existingConnection.userId;
      } else {
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: { avatarUrl },
          create: { email, displayName, avatarUrl },
        });
        await prisma.twitchConnection.upsert({
          where: { userId: dbUser.id },
          update: { twitchLogin, twitchUserId, verified: true },
          create: { userId: dbUser.id, twitchLogin, twitchUserId, verified: true },
        });
        dbUserId = dbUser.id;
      }

      (user as { id: string }).id = dbUserId;
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.userId = (user as { id: string }).id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Hinweis zum Verzicht auf den @next-auth/prisma-adapter: Er würde eigene
// Account/Session/VerificationToken-Tabellen mit next-auth-spezifischer
// Feldbenennung erzwingen. Da unser Datenmodell bewusst an der in der
// Spezifikation geforderten Struktur (User, TwitchConnection, ...)
// ausgerichtet ist und wir ausschließlich JWT-Sessions verwenden, wird die
// Twitch-Kontoverknüpfung stattdessen explizit im signIn()-Callback
// gepflegt (siehe oben).
