// Duel Ladder: fight one bot, and every win you climb to the next hero. Reach
// the top rung as fast as you can. A death sends you back to spawn, not down.
import { addBot, type DamagedEvent, type Player, serverCommand, type Vector } from 'modlock'

import { clock, stopwatch } from '../lib/format'
import { polar, yawOf } from '../lib/math'
import { enemyTeam, type HudModel, Mode, bestOf, recordBest } from './mode'

/** ladder lists the heroes you climb through. A hero the server lacks is skipped. */
export const LADDER: readonly string[] = [
  'hero_wraith', 'hero_haze', 'hero_inferno', 'hero_orion',
  'hero_hornet', 'hero_bebop', 'hero_shiv', 'hero_atlas',
]
const botHeroes: readonly string[] = ['hero_wraith', 'hero_haze', 'hero_inferno', 'hero_hornet']

export interface DuelOptions {
  /** reaction is the bots' enemy reaction time in seconds; lower is harder. */
  reaction: number
  label: string
  seconds: number
}

const respawnDelay = 2.2
const countdown = 3

export class DuelMode extends Mode {
  readonly id = 'duel'
  readonly name = 'Duel Ladder'
  override readonly bots = 'hostile' as const
  private bot?: Player
  private botEntity = 0
  private origin: Vector = { x: 0, y: 0, z: 0 }
  private yaw = 0
  private team = 2
  private rung = 0
  private armedAt = 0
  private endsAt = 0
  private kills = 0
  private deaths = 0
  private botDiedAt = -1
  private meDiedAt = -1
  private startedAt = 0

  constructor(player: Player, private readonly o: DuelOptions) {
    super(player)
  }

  start(now: number): boolean {
    const pawn = this.player.pawn()
    if (pawn === undefined || pawn.health <= 0) return false
    this.now = now
    this.origin = pawn.position
    this.yaw = pawn.eyeAngles.yaw
    this.team = pawn.team
    this.armedAt = now + countdown
    this.endsAt = this.armedAt + this.o.seconds
    serverCommand(`citadel_bot_brain_enemy_reaction_time ${this.o.reaction}`)
    const bot = addBot({
      name: 'Duelist', team: enemyTeam(this.team),
      hero: botHeroes[Math.floor(Math.random() * botHeroes.length)] as string,
      position: this.botSpot(),
    })
    if (!bot) return false
    this.bot = bot
    this.player.freeze(true)
    return true
  }

  private botSpot(): Vector {
    return polar(this.origin, this.yaw, 900, 0)
  }

  /** setHero puts the player on the current rung's hero, skipping one the server lacks. */
  private setHero(): void {
    while (this.rung < LADDER.length) {
      const id = this.player.selectHero(LADDER[this.rung] as string, this.team)
      if (id !== undefined) return
      this.rung++
    }
  }

  frame(now: number): void {
    this.now = now
    const me = this.player.pawn()
    const bot = this.bot?.pawn()
    if (me === undefined) return this.finish(false)
    if (now >= this.endsAt) return this.finish(false)
    if (bot) this.botEntity = bot.entity

    if (now < this.armedAt) return
    if (this.startedAt === 0) {
      this.startedAt = now
      this.player.freeze(false)
      this.setHero()
      this.say(`Rung 1 · ${this.heroName()}`, 'info')
    }
    // Bring fallen heroes back and reset the duel.
    if (me.health <= 0) {
      if (this.meDiedAt < 0) this.meDiedAt = now
      if (now - this.meDiedAt > respawnDelay) {
        this.player.respawn()
        this.meDiedAt = now + 0.5
      }
    } else if (this.meDiedAt > 0 && now > this.meDiedAt) {
      this.meDiedAt = -1
      this.reset()
    }
    if (bot && bot.health <= 0) {
      if (this.botDiedAt < 0) this.botDiedAt = now
      if (now - this.botDiedAt > respawnDelay) {
        this.bot?.respawn()
        this.botDiedAt = now + 0.5
      }
    } else if (bot && this.botDiedAt > 0 && now > this.botDiedAt) {
      this.botDiedAt = -1
      this.reset()
    }
  }

  /** reset puts both fighters back at their marks. */
  private reset(): void {
    this.player.teleport(this.origin, { pitch: 0, yaw: this.yaw, roll: 0 })
    const spot = this.botSpot()
    this.bot?.teleport(spot, { pitch: 0, yaw: yawOf(spot, this.origin), roll: 0 })
    this.player.heal(10000)
  }

  override damaged(hit: DamagedEvent): void {
    const me = this.player.pawn()
    if (!me || hit.healthLost < hit.healthBefore) return
    if (hit.victim === this.botEntity && hit.attacker === me.entity) {
      this.kills++
      this.rung++
      this.player.addMetric('duel.kills', 1)
      this.player.sound('Damage.Send.Crit')
      if (this.rung >= LADDER.length) return this.finish(true)
      this.setHero()
      if (this.rung >= LADDER.length) return this.finish(true)
      this.say(`Rung ${this.rung + 1} · ${this.heroName()}`, 'good')
    } else if (hit.victim === me.entity) {
      this.deaths++
      this.say('Down. Try again.', 'bad')
    }
  }

  private heroName(): string {
    return (LADDER[Math.min(this.rung, LADDER.length - 1)] as string).replace('hero_', '')
  }

  hud(now: number): HudModel {
    if (now < this.armedAt) {
      return { title: `${this.name} · ${this.o.label}`, big: String(Math.ceil(this.armedAt - now)), sub: 'Get ready', chips: [], hint: `Beat the duelist with ${LADDER.length} heroes.`, progress: 1 }
    }
    const left = Math.max(0, this.endsAt - now)
    const best = bestOf(this.player.slot, `duel.${this.o.label}`)
    return {
      title: `${this.name} · ${this.o.label}`,
      big: `${Math.min(this.rung + 1, LADDER.length)} / ${LADDER.length}`,
      sub: `${this.heroName()} · ${clock(left)}`,
      progress: this.rung / LADDER.length,
      chips: [
        { label: 'Kills', value: String(this.kills), tone: 'good' },
        { label: 'Deaths', value: String(this.deaths), tone: this.deaths ? 'bad' : undefined },
        { label: 'Best', value: best === undefined ? '-' : stopwatch(best) },
      ],
      hint: '/stop to end',
    }
  }

  private finish(won: boolean): void {
    if (this.done) return
    this.done = true
    const total = this.now - this.startedAt
    const key = `duel.${this.o.label}`
    let best = '', isNew = false
    if (won) {
      const r = recordBest(this.player.slot, key, total, false)
      best = `Session best ${stopwatch(r.best)}`
      isNew = r.isNew
      this.player.addMetric('duel.wins', 1)
    }
    this.result = {
      title: `${this.name} · ${this.o.label}`,
      headline: won ? `Ladder cleared in ${stopwatch(total)}` : `Reached rung ${Math.min(this.rung + 1, LADDER.length)}`,
      lines: [['Kills', String(this.kills)], ['Deaths', String(this.deaths)]],
      best: best || undefined,
      newBest: isNew,
    }
  }

  override stop(): void {
    this.player.freeze(false)
    this.bot?.removeBot()
    this.bot = undefined
    if (!this.done) this.finish(false)
  }
}
