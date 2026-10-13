// Aim Range: target heroes stand, strafe, flash or glide in front of the
// player. They never take damage; the mode scores the hits that reach them.
import { addBot, type DamageEvent, type DamageResult, type Player } from 'modlock'

import { Combo } from '../lib/combo'
import { clock, pct, thousands } from '../lib/format'
import { polar, yawOf } from '../lib/math'
import {
  expired, respawnAway, type Scenario, spawn, step, type TargetState,
} from '../lib/scenarios'
import { enemyTeam, type HudModel, Mode, recordBest, bestOf } from './mode'

const targetHero = 'hero_wraith'
const headGroup = 1
const countdown = 3

interface Target {
  bot: Player
  state: TargetState
  entity: number
}

export class AimMode extends Mode {
  readonly id = 'aim'
  readonly name: string
  override readonly bots = 'passive' as const
  private readonly targets: Target[] = []
  private readonly combo: Combo
  private origin = { x: 0, y: 0, z: 0 }
  private yaw = 0
  private armedAt = 0
  private endsAt = 0
  private last = 0
  private misses = 0
  private expiredCount = 0
  private fastest = 0
  private spawnedAt = 0
  private reactions: number[] = []

  constructor(player: Player, readonly scenario: Scenario, readonly seconds: number) {
    super(player)
    this.name = `Aim Range · ${scenario.name}`
    this.combo = new Combo(scenario.window)
  }

  start(now: number): boolean {
    const pawn = this.player.pawn()
    if (pawn === undefined || pawn.health <= 0) return false
    this.now = this.last = now
    this.origin = pawn.position
    this.yaw = pawn.eyeAngles.yaw
    this.armedAt = now + countdown
    this.endsAt = this.armedAt + this.seconds
    const team = enemyTeam(pawn.team)
    for (let i = 0; i < this.scenario.targets; i++) {
      const bot = addBot({ name: 'Target', team, hero: targetHero, position: this.world(spawn(this.scenario, now, i)) })
      if (!bot) {
        this.stop()
        return false
      }
      this.targets.push({ bot, state: spawn(this.scenario, now, i), entity: 0 })
    }
    this.spawnedAt = this.armedAt
    return true
  }

  private world(t: TargetState) {
    return polar(this.origin, this.yaw, t.f, t.l)
  }

  frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0, now - this.last))
    this.last = this.now = now
    if (this.player.pawn() === undefined) return this.finish()
    if (now >= this.endsAt) return this.finish()
    this.combo.decay(now)
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i] as Target
      if (now >= this.armedAt) {
        step(this.scenario, t.state, now, dt)
        if (expired(this.scenario, t.state, now)) {
          this.misses++
          this.expiredCount++
          this.combo.drop()
          t.state = respawnAway(this.scenario, now, t.state, i)
          this.say('Too slow', 'bad')
        }
      }
      const pawn = t.bot.pawn()
      if (pawn === undefined) continue
      t.entity = pawn.entity
      const pos = this.world(t.state)
      t.bot.teleport(pos, { pitch: 0, yaw: yawOf(pos, this.origin), roll: 0 })
    }
  }

  override hit(hit: DamageEvent): DamageResult | undefined {
    const target = this.targets.find((t) => t.entity !== 0 && t.entity === hit.victim)
    if (!target) return undefined
    const shooter = this.player.pawn()?.entity
    // Targets never die; only the player's own shots score, and only live ones.
    if (hit.attacker !== shooter || this.now < this.armedAt || this.now >= this.endsAt) {
      return { block: true }
    }
    const head = hit.hitGroup === headGroup
    const s = this.scenario
    if (s.headOnly && !head) {
      this.say('Aim higher', 'warn')
      return { block: true }
    }
    const points = this.combo.hit(head ? s.head : s.base, head, this.now)
    if (s.motion !== 'track') {
      this.reactions.push(this.now - Math.max(this.spawnedAt, target.state.bornAt))
      this.say(`${head ? 'HEADSHOT' : 'Hit'}  +${points}`, head ? 'good' : 'info')
      if (head) this.player.sound('Damage.Send.Crit')
      const i = this.targets.indexOf(target)
      target.state = respawnAway(s, this.now, target.state, i)
      this.spawnedAt = this.now
    }
    return { block: true }
  }

  hud(now: number): HudModel {
    const s = this.scenario
    const left = Math.max(0, this.endsAt - now)
    if (now < this.armedAt) {
      return {
        title: this.name, big: String(Math.ceil(this.armedAt - now)), sub: 'Get ready',
        chips: [{ label: 'Length', value: `${this.seconds}s` }], hint: s.blurb, progress: 1,
      }
    }
    const best = bestOf(this.player.slot, `aim.${s.id}`)
    return {
      title: this.name,
      big: thousands(this.combo.score),
      sub: clock(left),
      progress: left / this.seconds,
      chips: [
        { label: 'Combo', value: `x${this.combo.multiplier().toFixed(1)}`, tone: this.combo.streak > 4 ? 'good' : undefined },
        { label: 'Hits', value: String(this.combo.hits) },
        { label: 'Heads', value: `${this.combo.heads}`, tone: this.combo.heads > 0 ? 'warn' : undefined },
        ...(s.motion === 'flick' ? [{ label: 'Missed', value: String(this.expiredCount), tone: 'bad' as const }] : []),
        { label: 'Best', value: best === undefined ? '-' : thousands(best) },
      ],
      hint: '/stop to end',
    }
  }

  private finish(): void {
    if (this.done) return
    this.done = true
    const c = this.combo
    const avg = this.reactions.length
      ? this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length
      : 0
    const { best, isNew } = recordBest(this.player.slot, `aim.${this.scenario.id}`, c.score)
    this.result = {
      title: this.name,
      headline: `${thousands(c.score)} points`,
      lines: [
        ['Hits', String(c.hits)],
        ['Head shots', `${c.heads} (${pct(c.heads, c.hits)})`],
        ['Best combo', `x${(1 + Math.min(c.bestStreak, 10) * 0.1).toFixed(1)} · ${c.bestStreak} in a row`],
        ...(avg > 0 ? [['Avg. time to hit', `${avg.toFixed(2)}s`] as [string, string]] : []),
        ...(this.expiredCount > 0 ? [['Missed targets', String(this.expiredCount)] as [string, string]] : []),
      ],
      best: `Session best ${thousands(best)}`,
      newBest: isNew,
    }
    this.player.addMetric('aim.score', c.score, this.scenario.id)
    this.player.addMetric('aim.headshots', c.heads)
  }

  override stop(): void {
    if (!this.done) this.finish()
    for (const t of this.targets) t.bot.removeBot()
    this.targets.length = 0
  }
}
