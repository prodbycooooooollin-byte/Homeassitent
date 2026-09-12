"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { pingServer } from "@/lib/minecraft/slp";
import { runRconCommand } from "@/lib/minecraft/rcon";
import { parseListCommand } from "@/lib/minecraft/parse";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { generateAgentKey } from "@/lib/ingest/agent-key";
import { getPrimaryServer, getAppSettings } from "@/lib/server-context";
import { isSupportedServerTarget } from "@/lib/constants";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Nur Admins dürfen die Serververbindung verwalten.");
  }
  return user;
}

export interface SlpTestResult {
  ok: boolean;
  error?: string;
  motd?: string;
  versionName?: string;
  playersOnline?: number;
  playersMax?: number;
  latencyMs?: number;
}

export async function testSlpAction(host: string, port: number): Promise<SlpTestResult> {
  await requireAdmin();
  try {
    const result = await pingServer(host, port, 6000);
    return {
      ok: true,
      motd: result.motd,
      versionName: result.versionName,
      playersOnline: result.playersOnline,
      playersMax: result.playersMax,
      latencyMs: result.latencyMs,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler." };
  }
}

export interface RconTestResult {
  ok: boolean;
  error?: string;
  online?: number;
  max?: number;
  names?: string[];
}

export async function testRconAction(
  host: string,
  rconPort: number,
  password: string,
): Promise<RconTestResult> {
  await requireAdmin();
  try {
    const output = await runRconCommand(host, rconPort, password, "list", 6000);
    const parsed = parseListCommand(output);
    return { ok: true, ...parsed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler." };
  }
}

const configSchema = z.object({
  name: z.string().trim().min(2).max(60),
  host: z.string().trim().min(3).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(25565),
  minecraftVersion: z.string().min(1),
  platform: z.string().min(1),
  foundedAt: z.string().optional(),
  rconPort: z.coerce.number().int().min(1).max(65535).optional(),
  rconPassword: z.string().max(200).optional(),
  mapTileUrlTemplate: z.string().trim().max(500).optional(),
});

export interface SaveConfigResult {
  ok: boolean;
  error?: string;
}

export interface SaveConfigInput {
  name: string;
  host: string;
  port?: number | string;
  minecraftVersion: string;
  platform: string;
  foundedAt?: string;
  rconPort?: number | string;
  rconPassword?: string;
  mapTileUrlTemplate?: string;
}

export async function saveServerConfigAction(input: SaveConfigInput): Promise<SaveConfigResult> {
  await requireAdmin();
  const raw = {
    ...input,
    port: input.port || undefined,
    foundedAt: input.foundedAt || undefined,
    rconPort: input.rconPort || undefined,
    rconPassword: input.rconPassword || undefined,
    mapTileUrlTemplate: input.mapTileUrlTemplate || undefined,
  };
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const data = parsed.data;

  if (!isSupportedServerTarget(data.minecraftVersion, data.platform)) {
    return {
      ok: false,
      error: "Diese Kombination aus Minecraft-Version und Plattform wird aktuell nicht unterstützt.",
    };
  }

  const existing = await getPrimaryServer();
  const rconPort = data.rconPort === undefined ? null : data.rconPort;

  await prisma.minecraftServer.upsert({
    where: { id: existing?.id ?? "__none__" },
    update: {
      name: data.name,
      host: data.host,
      port: data.port,
      minecraftVersion: data.minecraftVersion,
      platform: data.platform,
      foundedAt: data.foundedAt ? new Date(data.foundedAt) : existing?.foundedAt ?? null,
      rconPort,
      mapTileUrlTemplate: data.mapTileUrlTemplate ?? null,
      ...(data.rconPassword ? { rconPasswordEncrypted: encryptSecret(data.rconPassword) } : {}),
    },
    create: {
      name: data.name,
      host: data.host,
      port: data.port,
      minecraftVersion: data.minecraftVersion,
      platform: data.platform,
      foundedAt: data.foundedAt ? new Date(data.foundedAt) : null,
      rconPort,
      mapTileUrlTemplate: data.mapTileUrlTemplate ?? null,
      rconPasswordEncrypted: data.rconPassword ? encryptSecret(data.rconPassword) : null,
    },
  });

  revalidatePath("/einstellungen");
  revalidatePath("/");
  return { ok: true };
}

export async function generateAgentKeyAction(): Promise<{ ok: boolean; key?: string; error?: string }> {
  await requireAdmin();
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Bitte zuerst die Serverdaten speichern." };

  const { plaintext, hash } = generateAgentKey();
  await prisma.minecraftServer.update({
    where: { id: server.id },
    data: { agentApiKeyHash: hash, agentKeyGeneratedAt: new Date() },
  });
  revalidatePath("/einstellungen");
  return { ok: true, key: plaintext };
}

export async function completeSetupAction(): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Bitte zuerst die Serverdaten speichern." };

  await prisma.$transaction([
    prisma.minecraftServer.update({
      where: { id: server.id },
      data: { setupCompletedAt: new Date() },
    }),
    prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: { demoModeEnabled: false },
      create: { id: "singleton", demoModeEnabled: false },
    }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setDemoModeAction(enabled: boolean): Promise<{ ok: boolean }> {
  await requireAdmin();
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: { demoModeEnabled: enabled },
    create: { id: "singleton", demoModeEnabled: enabled },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function getDemoModeState() {
  return getAppSettings();
}
