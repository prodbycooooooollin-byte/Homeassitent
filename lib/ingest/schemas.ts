import { z } from "zod";

const uuidField = z.string().min(32).max(36);

export const snapshotSchema = z.object({
  capturedAt: z.string().datetime().optional(),
  capabilities: z.array(z.string()).default([]),
  maxPlayers: z.number().int().positive().optional(),
  players: z.array(
    z.object({
      uuid: uuidField,
      username: z.string().min(1).max(32),
      online: z.boolean(),
      playtimeTicks: z.number().int().nonnegative().optional(),
      blocksMinedTotal: z.number().int().nonnegative().optional(),
      mobKillsTotal: z.number().int().nonnegative().optional(),
      deathsTotal: z.number().int().nonnegative().optional(),
      blocks: z.record(z.string(), z.number().int().nonnegative()).optional(),
      mobs: z.record(z.string(), z.number().int().nonnegative()).optional(),
      distances: z.record(z.string(), z.number().int().nonnegative()).optional(),
      advancements: z
        .array(z.object({ key: z.string(), unlockedAt: z.string().datetime() }))
        .optional(),
      firstSeenAt: z.string().datetime().optional(),
      position: z
        .object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
          dimension: z.enum(["OVERWORLD", "NETHER", "END"]),
        })
        .optional(),
    }),
  ),
  health: z
    .object({
      tps: z.number().optional(),
      tickTimeMs: z.number().optional(),
      memoryUsedMb: z.number().int().optional(),
      memoryMaxMb: z.number().int().optional(),
    })
    .optional(),
});
export type SnapshotPayload = z.infer<typeof snapshotSchema>;

export const sessionEventSchema = z.object({
  uuid: uuidField,
  username: z.string().min(1).max(32),
  type: z.enum(["join", "leave"]),
  at: z.string().datetime(),
});

export const deathEventSchema = z.object({
  uuid: uuidField,
  username: z.string().min(1).max(32),
  at: z.string().datetime(),
  message: z.string().max(300).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  dimension: z.enum(["OVERWORLD", "NETHER", "END"]).optional(),
});

export const linkAttemptSchema = z.object({
  code: z.string().min(4).max(16),
  uuid: uuidField,
  username: z.string().min(1).max(32),
});

export const serverStatusEventSchema = z.object({
  event: z.enum(["start", "stop"]),
  at: z.string().datetime(),
});
