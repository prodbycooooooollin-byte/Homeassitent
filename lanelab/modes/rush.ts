// Checkpoint Rush: markers appear on the floor around you, one after another.
// Touch each as fast as you can. A new set every run; it works on any map.
import { createText, type Player, type Vector, type WorldObject } from 'modlock'

import { arrow, between, bearing, dist2d, polar } from '../lib/math'
import { stopwatch } from '../lib/format'
import { clearBetween, groundAt } from '../lib/world'
import { type HudModel, Mode, bestOf, recordBest } from './mode'

const reach = 125
const countdown = 3

export class RushMode extends Mode {
  readonly id = 'rush'
  readonly name = 'Checkpoint Rush'
  private points: Vector[] = []
  private labels: WorldObject[] = []
  private index = 0
  private startedAt = 0
  private armedAt = 0
  private splits: number[] = []
  private lastSplitAt = 0

  constructor(player: Player, private readonly count: number, private readonly spread: number) {
    super(player)
  }

  start(now: number): boolean {
    const pawn = this.player.pawn()
    if (pawn === undefined || pawn.health <= 0) return false
    this.now = now
    this.armedAt = now + countdown
    let from = pawn.position
    for (let i = 0; i < this.count; i++) {
      const p = this.pointFrom(from)
      this.points.push(p)
      from = p
    }
    this.drawLabels()
    return true
  }

  /** pointFrom finds a floor spot with open air between it and where the last one stood. */
  private pointFrom(from: Vector): Vector {
    for (let i = 0; i < 14; i++) {
      const d = between(this.spread * 0.55, this.spread)
      const guess = polar(from, between(-180, 180), d, 0)
      const ground = groundAt({ ...guess, z: from.z })
      if (!ground || Math.abs(ground.z - from.z) > 260) continue
      if (!clearBetween(from, ground)) continue
      return ground
    }
    return polar(from, between(-180, 180), this.spread * 0.7, 0)
  }

  private drawLabels(): void {
    for (const l of this.labels) l.remove()
    this.labels = []
    for (let k = 0; k < 2; k++) {
      const i = this.index + k
      const p = this.points[i]
      if (!p) continue
      const final = i === this.points.length - 1
      const label = createText({
        text: final ? `FINISH\n${i + 1}` : `${i + 1}`,
        position: { x: p.x, y: p.y, z: p.z + 150 },
        fontSize: k === 0 ? 150 : 90,
        color: k === 0 ? 0xffd34dff : 0xffffff66,
        faceCamera: true,
      })
      if (label) this.labels.push(label)
    }
  }

  frame(now: number): void {
    this.now = now
    const pawn = this.player.pawn()
    if (pawn === undefined) return this.abort()
    if (now < this.armedAt) return
    if (this.startedAt === 0) {
      this.startedAt = this.lastSplitAt = now
    }
    const target = this.points[this.index]
    if (!target) return
    if (dist2d(pawn.position, target) < reach && Math.abs(pawn.position.z - target.z) < 180) {
      const split = now - this.lastSplitAt
      this.splits.push(split)
      this.lastSplitAt = now
      this.index++
      this.player.sound('Damage.Send.Crit')
      this.say(`CP ${this.index}  ${split.toFixed(2)}s`, 'good')
      if (this.index >= this.points.length) return this.finish(now)
      this.drawLabels()
    }
  }

  hud(now: number): HudModel {
    if (now < this.armedAt) {
      return { title: this.name, big: String(Math.ceil(this.armedAt - now)), sub: 'Get ready', chips: [], hint: `${this.count} checkpoints. Dash, slide, glide.`, progress: 1 }
    }
    const pawn = this.player.pawn()
    const target = this.points[Math.min(this.index, this.points.length - 1)]
    const dist = pawn && target ? Math.round(dist2d(pawn.position, target)) : 0
    const rel = pawn && target ? bearing(pawn.position, pawn.eyeAngles.yaw, target) : 0
    const best = bestOf(this.player.slot, 'rush')
    return {
      title: this.name,
      big: stopwatch(now - this.startedAt),
      sub: `checkpoint ${Math.min(this.index + 1, this.count)} of ${this.count}`,
      progress: 1 - this.index / this.count,
      chips: [
        { label: 'Next', value: arrow(rel) },
        { label: 'Distance', value: `${dist}` },
        { label: 'Last split', value: this.splits.length ? `${(this.splits[this.splits.length - 1] as number).toFixed(2)}s` : '-' },
        { label: 'Best', value: best === undefined ? '-' : stopwatch(best) },
      ],
      hint: '/stop to end',
    }
  }

  private finish(now: number): void {
    if (this.done) return
    this.done = true
    const total = now - this.startedAt
    // Faster is better, so the best is the smallest time.
    const { best, isNew } = recordBest(this.player.slot, 'rush', total, false)
    const slow = this.splits.indexOf(Math.max(...this.splits)) + 1
    this.result = {
      title: this.name,
      headline: stopwatch(total),
      lines: [
        ['Checkpoints', String(this.count)],
        ['Average split', `${(total / this.count).toFixed(2)}s`],
        ['Slowest leg', `CP ${slow} · ${Math.max(...this.splits).toFixed(2)}s`],
      ],
      best: `Session best ${stopwatch(best)}`,
      newBest: isNew,
    }
    this.player.addMetric('rush.runs', 1)
    this.player.addMetric('rush.pace', Math.round(100000 / Math.max(total, 1)))
  }

  private abort(): void {
    this.done = true
  }

  override stop(): void {
    for (const l of this.labels) l.remove()
    this.labels = []
  }
}
