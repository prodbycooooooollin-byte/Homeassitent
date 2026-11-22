/**
 * VICE INTEL content model.
 *
 * Every record carries verification metadata and source references so that the
 * UI, search and AI layer can always tell the player *how much to trust* a fact.
 * Records are validated with zod at load time (see repository.ts) and by
 * `npm run content:check`, so broken content never reaches production silently.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

export const VERIFICATION_STATUSES = [
  "verified", // confirmed in the released game by editors, with sources
  "official", // stated in official Rockstar material (trailers, website, newswire)
  "estimate", // a measured or calculated value with a stated method
  "theory", // plausible community theory — explicitly not fact
  "unverified", // community claim that has not been reproduced
  "demo", // sample record that illustrates the product — NOT game information
  "unknown", // nothing reliable is known yet
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const verificationSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  note: z.string().optional(),
  /** ISO date the record was last checked by an editor. */
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type Verification = z.infer<typeof verificationSchema>;

/** A single value (e.g. payout, duration) that can be verified or estimated independently of its record. */
export const valueSchema = z.object({
  label: z.string(),
  value: z.string(),
  status: z.enum(VERIFICATION_STATUSES),
});
export type QualifiedValue = z.infer<typeof valueSchema>;

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

export const sourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string().url().optional(),
  kind: z.enum(["official", "press", "community", "editorial", "internal"]),
  publishedAt: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

/* ------------------------------------------------------------------ */
/* Media / assets                                                      */
/* ------------------------------------------------------------------ */

export const ART_SCENES = [
  "skyline",
  "beach",
  "keys",
  "swamp",
  "mountain",
  "highway",
  "garage",
  "harbor",
  "industrial",
  "night-sky",
  "club",
  "vault",
  "suburb",
  "interior",
] as const;
export type ArtScene = (typeof ART_SCENES)[number];

export const mediaSchema = z
  .object({
    id: z.string(),
    alt: z.string().min(4),
    caption: z.string().optional(),
    /** Licensed image (local path under /public or an allow-listed remote host). */
    src: z.string().optional(),
    /** Alternative resolutions for responsive loading: width → URL. */
    srcSet: z.record(z.string(), z.string()).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    /** Original, procedurally generated illustration used when no licensed image exists. */
    art: z.object({ scene: z.enum(ART_SCENES), seed: z.number().int() }).optional(),
    /** Focal point for consistent cropping across aspect ratios (0–1). */
    focal: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
    attribution: z.object({
      label: z.string(),
      license: z.string(),
      url: z.string().url().optional(),
    }),
    /** True only for genuine, properly licensed in-game captures. */
    authenticGameplay: z.boolean().default(false),
  })
  .refine((m) => Boolean(m.src || m.art), { message: "media needs src or art" })
  .refine((m) => !(m.art && m.authenticGameplay), {
    message: "generated illustrations can never be marked as authentic gameplay",
  });
export type Media = z.infer<typeof mediaSchema>;

/* ------------------------------------------------------------------ */
/* Shared record fields                                                */
/* ------------------------------------------------------------------ */

export const ENTITY_KINDS = ["mission", "unlock", "easter-egg", "money", "location", "character"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

const mapPointSchema = z.object({
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  /** Status of the coordinate itself (a location can be official while a pin is approximate). */
  precision: z.enum(["exact", "approximate", "region"]),
});
export type MapPoint = z.infer<typeof mapPointSchema>;

const baseFields = {
  id: z.string().regex(/^[a-z-]+:[a-z0-9-]+$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(2),
  aliases: z.array(z.string()).default([]),
  summary: z.string().min(10),
  tags: z.array(z.string()).default([]),
  verification: verificationSchema,
  sources: z.array(z.string()).default([]),
  media: z.array(mediaSchema).min(1),
  locationId: z.string().optional(),
  mapPoint: mapPointSchema.optional(),
  related: z.array(z.string()).default([]),
  spoiler: z.enum(["none", "light", "heavy"]).default("none"),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
};

const stepSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  tip: z.string().optional(),
  media: mediaSchema.optional(),
  spoiler: z.boolean().default(false),
});
export type Step = z.infer<typeof stepSchema>;

const requirementSchema = z.object({
  label: z.string(),
  /** Linked record that satisfies this requirement, when it exists in the knowledge base. */
  ref: z.string().optional(),
  kind: z.enum(["mission", "activity", "time", "location", "item", "money", "progress", "other"]),
});
export type Requirement = z.infer<typeof requirementSchema>;

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export const missionSchema = z.object({
  ...baseFields,
  kind: z.literal("mission"),
  chapter: z.string().optional(),
  giver: z.string().optional(),
  startLocation: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  requirements: z.array(requirementSchema).default([]),
  objectives: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        steps: z.array(stepSchema).min(1),
        failurePoints: z.array(z.string()).default([]),
        alternatives: z.array(z.string()).default([]),
        spoiler: z.boolean().default(false),
      }),
    )
    .min(1),
  rewards: z.array(valueSchema).default([]),
});
export type Mission = z.infer<typeof missionSchema>;

export const UNLOCK_CATEGORIES = [
  "vehicle",
  "weapon",
  "equipment",
  "clothing",
  "accessory",
  "activity",
  "property",
  "reward",
] as const;
export type UnlockCategory = (typeof UNLOCK_CATEGORIES)[number];

export const unlockSchema = z.object({
  ...baseFields,
  kind: z.literal("unlock"),
  category: z.enum(UNLOCK_CATEGORIES),
  /** One-sentence answer to "how do I unlock this?" — always shown first. */
  howTo: z.string(),
  requirements: z.array(requirementSchema).default([]),
  steps: z.array(stepSchema).default([]),
  price: valueSchema.optional(),
  stats: z.array(valueSchema).default([]),
});
export type Unlock = z.infer<typeof unlockSchema>;

export const EGG_CATEGORIES = ["mystery", "reference", "hidden-location", "collectible", "ambient"] as const;

export const easterEggSchema = z.object({
  ...baseFields,
  kind: z.literal("easter-egg"),
  category: z.enum(EGG_CATEGORIES),
  conditions: z.array(requirementSchema).default([]),
  steps: z.array(stepSchema).default([]),
  background: z.string().optional(),
  /** Theories and community claims, each with its own status — never merged into the facts above. */
  claims: z.array(z.object({ text: z.string(), status: z.enum(VERIFICATION_STATUSES) })).default([]),
  rewards: z.array(valueSchema).default([]),
});
export type EasterEgg = z.infer<typeof easterEggSchema>;

export const MONEY_TYPES = ["mission", "heist", "business", "side-activity", "collectible", "race"] as const;

export const moneySchema = z.object({
  ...baseFields,
  kind: z.literal("money"),
  activityType: z.enum(MONEY_TYPES),
  /** Payout range in in-game dollars. `status` says whether it is verified or estimated. */
  payout: z.object({ min: z.number(), max: z.number(), status: z.enum(VERIFICATION_STATUSES) }),
  /** Minutes per run. */
  duration: z.object({ min: z.number(), max: z.number(), status: z.enum(VERIFICATION_STATUSES) }),
  difficulty: z.enum(["easy", "medium", "hard"]),
  repeatable: z.enum(["no", "daily", "cooldown", "unlimited"]),
  cooldownMinutes: z.number().optional(),
  progression: z.enum(["early", "mid", "late"]),
  requirements: z.array(requirementSchema).default([]),
  startupCost: z.number().default(0),
  strategy: z.array(z.string()).default([]),
  steps: z.array(stepSchema).default([]),
});
export type MoneyActivity = z.infer<typeof moneySchema>;

export const locationSchema = z.object({
  ...baseFields,
  kind: z.literal("location"),
  region: z.string(),
  character: z.string(),
  highlights: z.array(z.string()).default([]),
});
export type Location = z.infer<typeof locationSchema>;

export const characterSchema = z.object({
  ...baseFields,
  kind: z.literal("character"),
  role: z.string(),
  facts: z.array(z.string()).default([]),
});
export type Character = z.infer<typeof characterSchema>;

export const entitySchema = z.discriminatedUnion("kind", [
  missionSchema,
  unlockSchema,
  easterEggSchema,
  moneySchema,
  locationSchema,
  characterSchema,
]);
export type Entity = z.infer<typeof entitySchema>;
export type EntityInput = z.input<typeof entitySchema>;

export type EntityOfKind<K extends EntityKind> = Extract<Entity, { kind: K }>;
