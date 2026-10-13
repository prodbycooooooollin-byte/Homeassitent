// Last-Hit Lab: a trooper bleeds down toward a sliver of health, as if
// others were hitting it. Land the killing blow while it is low and you keep
// the souls. Ally troopers bleed too: finish those low ones to deny them.
import { type DamagedEvent, type Npc, type Player, spawnNpc } from 'modlock'

import { clock, pct } from '../lib/format'
import { between, polar, yawOf } from '../lib/math'
import { clearBetween, groundAt } from '../lib/world'
import { enemyTeam, type HudModel, Mode, recordBest, bestOf } from './mode'

const maxHp = 320
const floorHp = 36
/** window is the share of health under which a kill counts as a clean last hit. */
const window = 0.3
const patience = 6
const countdown = 3

interface Troop {
  npc: Npc
  ally: boolean
  hp: number
  bornAt: number
  floorAt: number
}

export interface LastHitOptions {
  seconds: number
  /** bleed is the health a trooper loses each second. */
  bleed: number
  deny: boolean
}

export class LastHitMode extends Mode {
  readonly id = 'lasthit'
  readonly name = 'Last-Hit Lab'
  private troop?: Troop
  private origin = { x: 0, y: 0, z: 0 }
  private yaw = 0
  private team = 2
  private armedAt = 0
  private endsAt = 0
  private nextAt = 0
  private last = 0
  private clean = 0
  private early = 0
  private missed = 0
  private denies = 0
  private streak = 0
  private bestStreak = 0
  private souls = 0

  constructor(player: Player, private readonly o: LastHitOptions) {
    super(player)
  }

  start(now: number): boolean {
    const pawn = this.player.pawn()
    if (pawn === undefined || pawn.health <= 0) return false
    this.now = this.last = now
    this.origin = pawn.position
    this.yaw = pawn.eyeAngles.yaw
    this.team = pawn.team
    this.armedAt = this.nextAt = now + countdown
    this.endsAt = this.armedAt + this.o.seconds
    return true
  }

  private spawnTroop(now: number): void {
    const ally = this.o.deny && Math.random() < 0.3
    let pos = polar(this.origin, this.yaw, between(420, 760), between(-340, 340))
    for (let i = 0; i < 14; i++) {
      const ground = groundAt(pos)
      if (ground && Math.abs(ground.z - this.origin.z) < 130 && clearBetween(this.origin, ground, 80)) {
        pos = ground
        break
      }
      pos = polar(this.origin, this.yaw + between(-60, 60), between(300, 650), 0)
    }
    const npc = spawnNpc({
      className: 'npc_trooper',
      unit: 'trooper_normal',
      team: ally ? this.team : enemyTeam(this.team),
      position: pos,
      facing: { pitch: 0, yaw: yawOf(pos, this.origin), roll: 0 },
      health: maxHp,
      maxHealth: maxHp,
    })
    if (!npc) {
      this.nextAt = now + 1
      return
    }
    this.troop = { npc, ally, hp: maxHp, bornAt: now, floorAt: 0 }
  }

  frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0, now - this.last))
    this.last = this.now = now
    if (this.player.pawn() === undefined || now >= this.endsAt) return this.finish()
    if (now < this.armedAt) return
    const t = this.troop
    if (!t) {
      if (now >= this.nextAt) this.spawnTroop(now)
      return
    }
    const state = t.npc.read()
    if (state === undefined) {
      // Gone without our judging it: someone else took the kill.
      this.troop = undefined
      this.nextAt = now + 0.6
      return
    }
    t.hp = Math.min(t.hp, state.health)
    if (t.hp > floorHp) {
      t.hp = Math.max(floorHp, t.hp - this.o.bleed * dt)
      t.npc.setHealth(t.hp, maxHp)
    } else if (t.floorAt === 0) {
      t.floorAt = now
    } else if (now - t.floorAt > patience) {
      this.miss(t, now)
    }
  }

  private miss(t: Troop, now: number): void {
    t.npc.remove()
    this.troop = undefined
    this.nextAt = now + 0.8
    if (t.ally) {
      this.say('Ally survived', 'warn')
      return
    }
    this.missed++
    this.streak = 0
    this.say('Missed: it got away', 'bad')
  }

  override damaged(hit: DamagedEvent): void {
    const t = this.troop
    if (!t || hit.victim !== t.npc.entity) return
    if (hit.attacker !== this.player.pawn()?.entity) return
    if (hit.healthLost < hit.healthBefore) return
    // The killing blow: judge how much health the trooper had left.
    const share = hit.healthBefore / maxHp
    this.troop = undefined
    this.nextAt = this.now + 0.6
    if (t.ally) {
      if (share <= 0.4) {
        this.denies++
        this.award(60, 'DENIED  +60')
      } else {
        this.say('Denied too early', 'warn')
      }
      return
    }
    if (share <= window) {
      this.clean++
      this.streak++
      this.bestStreak = Math.max(this.bestStreak, this.streak)
      this.award(100 + Math.min(this.streak, 10) * 10, `LAST HIT  +${100 + Math.min(this.streak, 10) * 10}`)
    } else {
      this.early++
      this.streak = 0
      this.say(`Too early (${Math.round(share * 100)}% left)`, 'warn')
    }
  }

  private award(souls: number, text: string): void {
    this.souls += souls
    this.player.adjustSouls(souls, true)
    this.say(text, 'good')
    this.player.sound('Damage.Send.Crit')
  }

  hud(now: number): HudModel {
    if (now < this.armedAt) {
      return {
        title: this.name, big: String(Math.ceil(this.armedAt - now)), sub: 'Get ready',
        chips: [], hint: 'Kill troopers once they are low. Too early wastes the souls.', progress: 1,
      }
    }
    const left = Math.max(0, this.endsAt - now)
    const total = this.clean + this.early + this.missed
    const best = bestOf(this.player.slot, 'lasthit')
    return {
      title: this.name,
      big: `${this.souls}`,
      sub: `souls · ${clock(left)}`,
      progress: left / this.o.seconds,
      chips: [
        { label: 'Last hits', value: String(this.clean), tone: 'good' },
        { label: 'Efficiency', value: pct(this.clean, total) },
        { label: 'Streak', value: String(this.streak) },
        { label: 'Missed', value: String(this.missed), tone: this.missed ? 'bad' : undefined },
        ...(this.o.deny ? [{ label: 'Denies', value: String(this.denies) }] : []),
        { label: 'Best', value: best === undefined ? '-' : String(best) },
      ],
      hint: '/stop to end',
    }
  }

  private finish(): void {
    if (this.done) return
    this.done = true
    const total = this.clean + this.early + this.missed
    const { best, isNew } = recordBest(this.player.slot, 'lasthit', this.souls)
    this.result = {
      title: this.name,
      headline: `${this.souls} souls`,
      lines: [
        ['Clean last hits', String(this.clean)],
        ['Efficiency', pct(this.clean, total)],
        ['Too early', String(this.early)],
        ['Missed', String(this.missed)],
        ['Best streak', String(this.bestStreak)],
        ...(this.o.deny ? [['Denies', String(this.denies)] as [string, string]] : []),
      ],
      best: `Session best ${best}`,
      newBest: isNew,
    }
    this.player.addMetric('lasthit.clean', this.clean)
    this.player.addMetric('lasthit.souls', this.souls)
  }

  override stop(): void {
    if (!this.done) this.finish()
    this.troop?.npc.remove()
    this.troop = undefined
  }
}
