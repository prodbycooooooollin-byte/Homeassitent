import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Bitte eine gültige Hex-Farbe angeben, z.B. #7c3aed.");

const urlField = z.string().trim().url("Bitte eine gültige URL angeben.").max(2000);
const optionalUrl = z.union([urlField, z.literal("")]).optional().transform((v) => (v ? v : undefined));

export const emailField = z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben.");
export const passwordField = z
  .string()
  .min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.")
  .max(200);
export const displayNameField = z.string().trim().min(2, "Mindestens 2 Zeichen.").max(40, "Maximal 40 Zeichen.");

// --- Auth -------------------------------------------------------------

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  displayName: displayNameField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Passwort erforderlich."),
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordField,
});

export const profileUpdateSchema = z.object({
  displayName: displayNameField.optional(),
  avatarUrl: optionalUrl,
  soundEnabled: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
});

export const twitchLinkSchema = z.object({
  login: z.string().trim().min(2).max(200),
});

// --- Rooms --------------------------------------------------------------

export const roomVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const createRoomSchema = z.object({
  name: z.string().trim().min(2, "Mindestens 2 Zeichen.").max(60, "Maximal 60 Zeichen."),
  logoUrl: optionalUrl,
  teamAName: z.string().trim().min(1).max(30).default("Team A"),
  teamBName: z.string().trim().min(1).max(30).default("Team B"),
  teamAColor: hexColor.default("#8b5cf6"),
  teamBColor: hexColor.default("#22d3ee"),
  password: z.string().min(4, "Mindestens 4 Zeichen.").max(100),
  maxMembersPerTeam: z.coerce.number().int().min(1).max(10).default(4),
  startAt: z.coerce.date().optional(),
  timeLimitMinutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
  visibility: roomVisibilitySchema.default("PRIVATE"),
  allowMemberProgress: z.boolean().default(true),
  onlyTeamLeadEdits: z.boolean().default(false),
  requireHostConfirmation: z.boolean().default(true),
  requireJoinApproval: z.boolean().default(false),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSettingsSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  logoUrl: optionalUrl,
  teamAName: z.string().trim().min(1).max(30).optional(),
  teamBName: z.string().trim().min(1).max(30).optional(),
  teamAColor: hexColor.optional(),
  teamBColor: hexColor.optional(),
  newPassword: z.string().min(4).max(100).optional(),
  maxMembersPerTeam: z.coerce.number().int().min(1).max(10).optional(),
  startAt: z.coerce.date().nullable().optional(),
  timeLimitMinutes: z.coerce.number().int().min(1).max(24 * 60).nullable().optional(),
  visibility: roomVisibilitySchema.optional(),
  allowMemberProgress: z.boolean().optional(),
  onlyTeamLeadEdits: z.boolean().optional(),
  requireHostConfirmation: z.boolean().optional(),
  requireJoinApproval: z.boolean().optional(),
  teamsLocked: z.boolean().optional(),
});

export const joinRoomSchema = z
  .object({
    code: z.string().trim().min(4).max(20),
    password: z.string().max(200).optional(),
    inviteToken: z.string().max(200).optional(),
  })
  .refine((data) => Boolean(data.password) || Boolean(data.inviteToken), {
    message: "Raum-Passwort oder Einladungstoken erforderlich.",
    path: ["password"],
  });

export const createInviteSchema = z.object({
  label: z.string().trim().max(60).optional(),
  maxUses: z.coerce.number().int().min(1).max(50).default(1),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
});

export const assignTeamSchema = z.object({
  side: z.enum(["A", "B"]).nullable(),
});

export const memberActionSchema = z.object({
  action: z.enum(["PROMOTE_LEAD", "DEMOTE_LEAD", "REMOVE", "APPROVE", "ASSIGN_TEAM"]),
  side: z.enum(["A", "B"]).nullable().optional(),
});

// --- Challenge / Games ----------------------------------------------------

export const progressTypeSchema = z.enum(["WINS", "POINTS", "TASK"]);
export const appliesToSchema = z.enum(["BOTH", "TEAM_A", "TEAM_B"]);

export const gameSchema = z.object({
  name: z.string().trim().min(1, "Name erforderlich.").max(80),
  coverUrl: optionalUrl,
  progressType: progressTypeSchema.default("WINS"),
  targetValue: z.coerce.number().int().min(1).max(999).default(1),
  timeLimitMinutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
  rulesText: z.string().trim().max(500).optional(),
  appliesTo: appliesToSchema.default("BOTH"),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  bonusPoints: z.coerce.number().int().min(0).max(1000).optional(),
  requireEvidence: z.boolean().default(false),
  requiresPreviousCompleted: z.boolean().default(false),
});
export type GameInput = z.infer<typeof gameSchema>;

export const gameUpdateSchema = gameSchema.partial();

export const reorderGamesSchema = z.object({
  orderedIds: z.array(z.string().cuid2().or(z.string().min(10))).min(1),
});

// --- Progress ---------------------------------------------------------

export const progressUpdateSchema = z.object({
  teamId: z.string().min(10),
  gameId: z.string().min(10),
  delta: z.coerce.number().int().refine((v) => v !== 0 && Math.abs(v) <= 100, "Ungültige Änderung."),
});

export const evidenceSchema = z
  .object({
    progressId: z.string().min(10),
    url: optionalUrl,
    comment: z.string().trim().max(500).optional(),
  })
  .refine((d) => Boolean(d.url) || Boolean(d.comment), { message: "Bitte Link oder Kommentar angeben." });

// --- Overlays --------------------------------------------------------------

export const overlayTypeSchema = z.enum([
  "TEAM_COMPARISON",
  "TEAM_A",
  "TEAM_B",
  "COMPACT",
  "CURRENT_GAME",
  "FULL_LIST",
  "WINNER",
]);

export const overlayConfigSchema = z.object({
  showMemberAvatars: z.boolean().default(true),
  showLastActivity: z.boolean().default(true),
  showTimer: z.boolean().default(true),
  showAnimations: z.boolean().default(true),
  soundEnabled: z.boolean().default(false),
  compact: z.boolean().default(false),
  fontSize: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  backgroundOpacity: z.coerce.number().min(0).max(100).default(0),
  position: z.enum(["top", "bottom", "left", "right", "center"]).default("top"),
  accentMode: z.enum(["team", "brand"]).default("team"),
});
export type OverlayConfigInput = z.infer<typeof overlayConfigSchema>;

export const overlayTokenCreateSchema = z.object({
  label: z.string().trim().max(60).optional(),
});
