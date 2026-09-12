import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAgentKey } from "@/lib/ingest/agent-key";
import { AGENT_KEY_HEADER } from "@/lib/constants";
import type { MinecraftServer } from "@prisma/client";

/**
 * Auth-Guard für die Ingest-Routen (app/api/ingest/**), die vom
 * Connector-Agent aufgerufen werden - NICHT vom Browser. Authentifizierung
 * erfolgt über den Agent-API-Key im Header, nicht über das Session-Cookie.
 */
export async function requireAgent(
  req: Request,
): Promise<{ server: MinecraftServer } | { response: NextResponse }> {
  const key = req.headers.get(AGENT_KEY_HEADER);
  if (!key) {
    return {
      response: NextResponse.json(
        { error: `Fehlender ${AGENT_KEY_HEADER}-Header.` },
        { status: 401 },
      ),
    };
  }

  const server = await prisma.minecraftServer.findFirst({
    where: { agentApiKeyHash: { not: null } },
  });

  if (!server?.agentApiKeyHash || !verifyAgentKey(key, server.agentApiKeyHash)) {
    return { response: NextResponse.json({ error: "Ungültiger Agent-Key." }, { status: 401 }) };
  }

  return { server };
}
