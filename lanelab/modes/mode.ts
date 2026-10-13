// Every training mode is one Mode: it starts for a player, follows each frame,
// may judge hits, and describes its HUD as plain data.
import type { DamageEvent, DamageResult, DamagedEvent, Player } from 'modlock'

export type Tone = 'good' | 'bad' | 'warn' | 'info'

export interface Chip {
  label: string
  value: string
  tone?: Tone
}

/** HudModel is everything the HUD draws for one mode this frame. */
export interface HudModel {
  title: string
  /** big is the main readout: a timer, a score or a clock. */
  big: string
  sub?: string
  chips: Chip[]
  hint?: string
  /** progress runs from 0 to 1 across the top bar. */
  progress?: number
}

/** Result is what a finished mode shows on the result card. */
export interface Result {
  title: string
  headline: string
  lines: Array<[string, string]>
  best?: string
  newBest: boolean
}

/** Bots says how the mode wants bot heroes to behave on the server. */
export type Bots = 'none' | 'passive' | 'hostile'

export interface Feed {
  text: string
  tone: Tone
  at: number
}

export abstract class Mode {
  abstract readonly id: string
  abstract readonly name: string
  readonly bots: Bots = 'none'
  done = false
  result?: Result
  feed?: Feed
  /** now is the game clock at the latest frame. */
  now = 0

  constructor(readonly player: Player) {}

  /** start prepares the mode, and reports whether it can run. */
  abstract start(now: number): boolean
  abstract frame(now: number): void
  abstract hud(now: number): HudModel

  hit(_hit: DamageEvent): DamageResult | undefined {
    return undefined
  }
  damaged(_hit: DamagedEvent): void {}
  /** stop removes everything the mode placed. It runs once, finished or not. */
  stop(): void {}

  protected say(text: string, tone: Tone = 'info'): void {
    this.feed = { text, tone, at: this.now }
  }
}

/** enemyTeam is the other team of the two a hero can join. */
export const enemyTeam = (team: number): number => (team === 2 ? 3 : 2)

/** bestKey names a personal best of one player in one mode. */
export const bestKey = (slot: number, key: string): string => `${slot}|${key}`

const bests = new Map<string, number>()

/** recordBest keeps a player's best of the session and says whether it beat the old. */
export function recordBest(
  slot: number,
  key: string,
  value: number,
  higher = true,
): { best: number; isNew: boolean } {
  const k = bestKey(slot, key)
  const old = bests.get(k)
  const beat = old === undefined || (higher ? value > old : value < old)
  if (beat) bests.set(k, value)
  return { best: beat ? value : (old as number), isNew: beat && old !== undefined }
}

export function bestOf(slot: number, key: string): number | undefined {
  return bests.get(bestKey(slot, key))
}

/** forgetSlot drops the bests of a player who left. */
export function forgetSlot(slot: number): void {
  for (const k of [...bests.keys()]) if (k.startsWith(`${slot}|`)) bests.delete(k)
}
