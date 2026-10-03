import { z } from 'zod';
import {
  ANSWER_SECONDS_OPTIONS,
  AVATARS,
  CLIPS_PER_PERSON_OPTIONS,
  MAX_CANDIDATES,
  MAX_INDEX_HASHES,
  REACTION_EMOJIS,
  ROOM_CODE_LENGTH
} from './constants.js';

/* ------------------------------------------------------------------ */
/* Grundbausteine                                                      */
/* ------------------------------------------------------------------ */

export const ClipSourceSchema = z.enum(['tiktok', 'demo']);
export type ClipSource = z.infer<typeof ClipSourceSchema>;

/** TikTok-Video-IDs sind numerisch; Demo-IDs haben ein eigenes Präfix. */
export const TikTokVideoIdSchema = z.string().regex(/^\d{6,25}$/);
export const DemoVideoIdSchema = z.string().regex(/^demo-[a-z0-9]{4,32}$/);

export const ClipRefSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('tiktok'), videoId: TikTokVideoIdSchema }),
  z.object({ source: z.literal('demo'), videoId: DemoVideoIdSchema })
]);
export type ClipRef = z.infer<typeof ClipRefSchema>;

export const PlayerIdSchema = z.string().regex(/^p_[A-Za-z0-9_-]{6,32}$/);
export const RoomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`)));

/** Anzeigenamen: sichtbare Zeichen, keine Steuerzeichen, 2–20 Zeichen. */
export const DisplayNameSchema = z
  .string()
  .transform((s) => s.normalize('NFC').replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(2)
      .max(20)
      .refine((s) => !/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/.test(s), {
        message: 'Unzulässige Zeichen'
      })
  );

export const AvatarSchema = z.enum(AVATARS);
export const DeviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const ProfileSchema = z.object({
  name: DisplayNameSchema,
  avatar: AvatarSchema,
  deviceId: DeviceIdSchema
});
export type Profile = z.infer<typeof ProfileSchema>;

export const RoomModeSchema = z.enum(['tiktok', 'demo']);
export type RoomMode = z.infer<typeof RoomModeSchema>;

export const ClipsPerPersonSchema = z.union(CLIPS_PER_PERSON_OPTIONS.map((n) => z.literal(n)) as unknown as [
  z.ZodLiteral<5>,
  z.ZodLiteral<8>,
  z.ZodLiteral<10>
]);
export const AnswerSecondsSchema = z.union(ANSWER_SECONDS_OPTIONS.map((n) => z.literal(n)) as unknown as [
  z.ZodLiteral<15>,
  z.ZodLiteral<20>,
  z.ZodLiteral<30>
]);

export const RoomSettingsSchema = z.object({
  clipsPerPerson: ClipsPerPersonSchema,
  answerSeconds: AnswerSecondsSchema
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

/* ------------------------------------------------------------------ */
/* Client → Server                                                     */
/* ------------------------------------------------------------------ */

export const CandidateSchema = z.object({
  videoId: z.string().min(6).max(40),
  /** Zeitpunkt des Likes (ms seit Epoch), sofern bekannt. */
  likedAt: z.number().int().nonnegative().optional()
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const PoolSubmissionSchema = z.object({
  source: ClipSourceSchema,
  candidates: z.array(CandidateSchema).max(MAX_CANDIDATES),
  /** Gesalzene, gekürzte Hashes des vollständigen lokalen Index (ohne Klartext-IDs). */
  indexHashes: z.array(z.string().regex(/^[a-f0-9]{16}$/)).max(MAX_INDEX_HASHES),
  /** Anzahl der lokal verfügbaren Likes insgesamt (nur Statusanzeige). */
  totalAvailable: z.number().int().nonnegative().max(1_000_000)
});
export type PoolSubmission = z.infer<typeof PoolSubmissionSchema>;

export const C2S = {
  timeSync: z.object({ t0: z.number() }),
  createRoom: z.object({ profile: ProfileSchema, mode: RoomModeSchema, protocolVersion: z.number().int() }),
  joinRoom: z.object({ code: RoomCodeSchema, profile: ProfileSchema, protocolVersion: z.number().int() }),
  resumeRoom: z.object({ code: RoomCodeSchema, token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/) }),
  leaveRoom: z.object({}).strict(),
  updateSettings: RoomSettingsSchema.partial(),
  setReady: z.object({ ready: z.boolean() }),
  submitPool: PoolSubmissionSchema,
  mediaCheck: z.object({ ok: z.boolean() }),
  kick: z.object({ playerId: PlayerIdSchema }),
  start: z.object({}).strict(),
  react: z.object({ emoji: z.enum(REACTION_EMOJIS) }),
  playerStatus: z.object({
    roundId: z.string().max(40),
    status: z.enum(['ready', 'failed']),
    reason: z.enum(['unavailable', 'timeout', 'network', 'unknown']).optional()
  }),
  playback: z.object({
    roundId: z.string().max(40),
    kind: z.enum(['started', 'buffering', 'resumed', 'error']),
    /** Abspielposition laut Player in Sekunden. */
    position: z.number().min(0).max(3600)
  }),
  vote: z.object({
    roundId: z.string().max(40),
    targetId: PlayerIdSchema,
    voteId: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/)
  }),
  hostPause: z.object({ paused: z.boolean() }),
  rematch: z.object({}).strict(),
  toLobby: z.object({}).strict()
} as const;

export type C2SEvents = { [K in keyof typeof C2S]: z.infer<(typeof C2S)[K]> };
