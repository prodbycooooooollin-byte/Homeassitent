import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getPrimaryServer, getConnectionLevel } from "@/lib/server-context";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [mcAccount, server] = await Promise.all([
    prisma.minecraftAccount.findUnique({ where: { userId: user.id } }),
    getPrimaryServer(),
  ]);

  const connectionLevel = getConnectionLevel(server);

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        role: user.role,
        mcUsername: mcAccount?.username,
        mcUuid: mcAccount?.uuid,
      }}
      connectionLevel={connectionLevel}
    >
      {children}
    </AppShell>
  );
}
